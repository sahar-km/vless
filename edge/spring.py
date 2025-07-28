import base64
import datetime
import ipaddress
import json
import logging
import os
import platform
import subprocess
import sys
import shutil
import requests  # اضافه کردن ماژول requests

# تنظیم لاگینگ
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("spring_debug.log"),
        logging.StreamHandler()
    ]
)

# ثابت‌ها
IRAN_SYMBOL = "⚪️"
FOREIGN_SYMBOL = "🟢"
IR_TAG = f"{IRAN_SYMBOL}Tehran"
SW_TAG = f"{FOREIGN_SYMBOL}Somewhere"

# پیشوندهای IPv4 مرتبط با سرویس CloudFlare WARP
warp_cidr = [
    "8.6.112.0/24",
    "8.34.70.0/24",
    "8.34.146.0/24",
    "8.35.211.0/24",
    "8.39.125.0/24",
    "8.39.204.0/24",
    "8.47.69.0/24",
    "162.159.192.0/24",
    "162.159.195.0/24",
    "188.114.96.0/24",
    "188.114.97.0/24",
    "188.114.98.0/24",
    "188.114.99.0/24",
]

# مسیرها
script_directory = os.path.dirname(os.path.abspath(__file__))
main_directory = os.path.dirname(script_directory)
edge_directory = os.path.join(main_directory, "edge")
edge_assets_directory = os.path.join(edge_directory, "assets")
edge_logs_directory = os.path.join(edge_assets_directory, "logs")
edge_bestip_path = os.path.join(edge_directory, "Bestip.txt")
edge_result_path = os.path.join(edge_directory, "Endpoints.csv")
main_singbox_path = os.path.join(main_directory, "sing-box.json")
main_warp_path = os.path.join(main_directory, "warp.json")

# تابع برای ایجاد دایرکتوری‌های مورد نیاز
def create_directories():
    """ایجاد تمام دایرکتوری‌های مورد نیاز در صورت عدم وجود"""
    directories = [
        edge_directory,
        edge_assets_directory,
        edge_logs_directory
    ]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            logging.info(f"Created directory: {directory}")

# تابع برای ایجاد لیست آدرس‌های IP
def create_ips():
    logging.info("Creating Bestip.txt file...")
    try:
        with open(edge_bestip_path, "w") as file:
            for cidr in warp_cidr:
                for addr in ipaddress.IPv4Network(cidr):
                    file.write(f"{addr}\n")
        logging.info("Bestip.txt file created successfully!")
        return True
    except Exception as e:
        logging.error(f"Error creating Bestip.txt: {e}")
        return False

# تابع برای تعیین پسوند معماری
def arch_suffix():
    machine = platform.machine().lower()
    if machine.startswith("i386") or machine.startswith("i686"):
        return "386"
    elif machine.startswith(("x86_64", "amd64")):
        return "amd64"
    elif machine.startswith(("armv8", "arm64", "aarch64")):
        return "arm64"
    elif machine.startswith("s390x"):
        return "s390x"
    else:
        logging.error(f"Unsupported CPU architecture: {machine}")
        raise ValueError(
            "Unsupported CPU architecture. Supported architectures are: i386, i686, x86_64, amd64, armv8, arm64, aarch64, s390x"
        )

# تابع برای تولید کانفیگ Hiddify
def export_Hiddify(t_ips):
    try:
        config_prefix = f"warp://{t_ips[0]}?ifp=1-3&ifpm=m4#{IR_TAG}&&detour=warp://{t_ips[1]}?ifp=1-2&ifpm=m5#{SW_TAG}"
        formatted_time = datetime.datetime.now().strftime("%A, %d %b %Y, %H:%M")
        return config_prefix, formatted_time
    except Exception as e:
        logging.error(f"Error generating Hiddify config: {e}")
        return None, None

# تابع برای تولید کانفیگ Sing-box
def toSingBox(tag, clean_ip, detour):
    logging.info(f"Generating Warp config for {tag}")
    
    # دانلود اسکریپت API با استفاده از requests به جای subprocess
    api_script_url = "https://gitlab.com/fscarmen/warp/-/raw/main/api.sh"
    api_script_path = "api.sh"
    
    try:
        response = requests.get(api_script_url)
        response.raise_for_status()
        
        with open(api_script_path, "w") as f:
            f.write(response.text)
        
        # تغییر مجوز فایل برای اجرا
        os.chmod(api_script_path, 0o755)
        
        # اجرای اسکریپت بدون sudo
        result = subprocess.run(
            ["bash", api_script_path, "-r"], 
            capture_output=True, 
            text=True,
            timeout=30  # افزودن تایم‌اوت برای جلوگیری از هنگ کردن
        )
        
        if result.returncode != 0:
            logging.error(f"api.sh execution failed with return code {result.returncode}")
            logging.error(f"stderr: {result.stderr}")
            return None
            
        output = result.stdout
        logging.info(f"api.sh executed successfully")
        
    except requests.RequestException as e:
        logging.error(f"Failed to download api.sh: {e}")
        return None
    except subprocess.TimeoutExpired:
        logging.error("api.sh execution timed out")
        return None
    except Exception as e:
        logging.error(f"Error executing api.sh: {e}")
        return None
    finally:
        # حذف فایل موقت
        if os.path.exists(api_script_path):
            try:
                os.remove(api_script_path)
                logging.info("api.sh file removed.")
            except Exception as e:
                logging.warning(f"Failed to remove api.sh: {e}")
    
    if not output:
        logging.error("api.sh produced no output")
        return None
        
    try:
        data = json.loads(output)
        wg = {
            "address": [
                "172.16.0.2/32",
                "2606:4700:110:8836:f1c9:4393:9b37:3814/128",
            ],
            "detour": f"{detour}",
            "mtu": 1280,
            "peers": [
                {
                    "address": f"{clean_ip.split(':')[0]}",
                    "allowed_ips": ["0.0.0.0/0", "::/0"],
                    "persistent_keepalive_interval": 30,
                    "port": int(clean_ip.split(":")[1]),
                    "public_key": "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=",
                    "reserved": data["config"]["reserved"],
                }
            ],
            "private_key": f"{data['private_key']}",
            "tag": tag,
            "type": "wireguard",
            "workers": 2,
        }
        return wg
    except (json.JSONDecodeError, KeyError) as e:
        logging.error(f"Error processing JSON data: {e}")
        logging.error(f"Raw output: {output[:500]}...")  # نمایش فقط 500 کاراکتر اول
        return None

# تابع برای صادرات کانفیگ Sing-box
def export_SingBox(t_ips):
    template_path = os.path.join(edge_assets_directory, "singbox-template.json")
    if not os.path.exists(template_path):
        logging.error(f"Template file not found at {template_path}")
        raise FileNotFoundError(f"Template file not found at {template_path}")
    
    try:
        with open(template_path, "r") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        logging.error(f"Error parsing template JSON: {e}")
        raise
    
    # اضافه کردن تگ‌ها به outbounds
    if "outbounds" not in data or len(data["outbounds"]) < 2:
        logging.error("Invalid template structure: missing or insufficient outbounds")
        raise ValueError("Invalid template structure")
        
    data["outbounds"][0]["outbounds"].extend([IR_TAG, SW_TAG])
    data["outbounds"][1]["outbounds"].extend([IR_TAG, SW_TAG])
    
    # اضافه کردن endpoints
    if "endpoints" not in data:
        data["endpoints"] = []
    
    tehran_wg = toSingBox(IR_TAG, t_ips[0], "direct")
    if tehran_wg:
        data["endpoints"].append(tehran_wg)
    else:
        logging.error(f"Failed to generate {IR_TAG} configuration.")
    
    Somewhere_wg = toSingBox(SW_TAG, t_ips[1], IR_TAG)
    if Somewhere_wg:
        data["endpoints"].append(Somewhere_wg)
    else:
        logging.error(f"Failed to generate {SW_TAG} configuration.")
    
    try:
        with open(main_singbox_path, "w") as f:
            json.dump(data, f, indent=2)
        logging.info(f"Sing-box config saved to {main_singbox_path}")
    except Exception as e:
        logging.error(f"Error saving Sing-box config: {e}")
        raise

# تابع برای اجرای اسکن IP با استفاده از برنامه warp
def scan_ips(warp_executable):
    logging.info("Scanning IPs...")
    try:
        # اجرای برنامه warp با تایم‌اوت برای جلوگیری از هنگ کردن
        result = subprocess.run(
            [warp_executable], 
            check=True, 
            capture_output=True, 
            text=True,
            timeout=300,  # 5 دقیقه تایم‌اوت
            cwd=edge_directory  # اجرا در دایرکتوری edge
        )
        logging.info("Warp executed successfully.")
        logging.debug(f"Warp output: {result.stdout[:500]}...")  # نمایش فقط 500 کاراکتر اول
        
        # بررسی وجود فایل نتایج
        if not os.path.exists(edge_result_path):
            logging.error("Endpoints.csv was not generated by warp executable.")
            raise FileNotFoundError("Endpoints.csv was not generated by warp executable.")
        
        return True
    except subprocess.TimeoutExpired:
        logging.error("Warp execution timed out")
        return False
    except subprocess.CalledProcessError as e:
        logging.error(f"Error executing warp: {e}")
        logging.error(f"stderr: {e.stderr}")
        return False
    except Exception as e:
        logging.error(f"Unexpected error during IP scanning: {e}")
        return False

# تابع برای خواندن بهترین IPها از فایل نتایج
def read_best_ips():
    Bestip = []
    try:
        with open(edge_result_path, "r") as csv_file:
            next(csv_file)  # پرش از هدر
            for line in csv_file:
                ip = line.split(",")[0].strip()
                if ip:  # اطمینان از اینکه IP خالی نیست
                    Bestip.append(ip)
                    if len(Bestip) == 2:
                        break
    except Exception as e:
        logging.error(f"Error reading Endpoints.csv: {e}")
        return []
    
    if len(Bestip) < 2:
        logging.error("Less than 2 clean IPs found in Endpoints.csv.")
        return []
    
    logging.info(f"Selected IPs: {Bestip}")
    return Bestip

# تابع اصلی
def main():
    try:
        # ایجاد دایرکتوری‌های مورد نیاز
        create_directories()
        
        # ایجاد فایل Bestip.txt در صورت عدم وجود
        if os.path.exists(edge_bestip_path):
            logging.info("Bestip.txt file already exists.")
        else:
            if not create_ips():
                logging.error("Failed to create Bestip.txt")
                sys.exit(1)
        
        # تعیین معماری سیستم
        arch = arch_suffix()
        logging.info(f"System architecture: {arch}")
        
        # دانلود برنامه warp
        logging.info("Fetching warp program...")
        url = f"https://gitlab.com/Misaka-blog/warp-script/-/raw/main/files/warp-yxip/warp-linux-{arch}"
        warp_executable = os.path.join(edge_directory, "warp")
        
        try:
            # دانلود با استفاده از requests به جای subprocess
            response = requests.get(url, stream=True)
            response.raise_for_status()
            
            with open(warp_executable, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # تنظیم مجوز اجرا
            os.chmod(warp_executable, 0o755)
            logging.info("Warp program downloaded successfully.")
        except requests.RequestException as e:
            logging.error(f"Failed to download warp program: {e}")
            sys.exit(1)
        
        # اجرای اسکن IP
        if not scan_ips(warp_executable):
            logging.error("IP scanning failed")
            sys.exit(1)
        
        # خواندن بهترین IPها
        Bestip = read_best_ips()
        if not Bestip:
            logging.error("No valid IPs found")
            sys.exit(1)
        
        # تولید کانفیگ Hiddify
        formatted_time = datetime.datetime.now().strftime("%a, %H:%M:%S")
        config_prefix, _ = export_Hiddify(Bestip)
        
        if not config_prefix:
            logging.error("Failed to generate Hiddify config")
            sys.exit(1)
        
        # جزئیات پروفایل Hiddify
        title = (
            "//profile-title: base64:"
            + base64.b64encode("Freedom to Dream 🤍".encode("utf-8")).decode("utf-8")
            + "\n"
        )
        update_interval = "//profile-update-interval: 6\n"
        sub_info = "//subscription-userinfo: upload = 800306368000; download = 2576980377600; total = 6012954214400; expire = 1794182399\n"
        profile_web = "//profile-web-page-url: https://github.com/NiREvil/vless\n"
        last_modified = "//last update on: " + formatted_time + "\n"
        
        # ذخیره کانفیگ Hiddify
        try:
            with open(main_warp_path, "w") as op:
                op.write(
                    title
                    + update_interval
                    + sub_info
                    + profile_web
                    + last_modified
                    + config_prefix
                )
            logging.info(f"Hiddify config saved to {main_warp_path}")
        except Exception as e:
            logging.error(f"Error saving Hiddify config: {e}")
            sys.exit(1)
        
        # تولید کانفیگ Sing-box
        export_SingBox(Bestip)
        
        logging.info("All configurations generated successfully!")
        
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
        sys.exit(1)
    finally:
        # حذف فایل‌های موقت
        temp_files = [edge_bestip_path, os.path.join(edge_directory, "warp")]
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    logging.info(f"Removed temporary file: {temp_file}")
            except Exception as e:
                logging.warning(f"Failed to remove temporary file {temp_file}: {e}")

if __name__ == "__main__":
    main()
