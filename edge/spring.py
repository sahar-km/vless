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

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Constants
IRAN_SYMBOL = "⚪️"
FOREIGN_SYMBOL = "🟢"
IR_TAG = f"{IRAN_SYMBOL}Tehran"
SW_TAG = f"{FOREIGN_SYMBOL}Somewhere"

# IPv4 prefixes associated with the CloudFlare WARP service
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

# Paths
script_directory = os.path.dirname(os.path.abspath(__file__))
main_directory = os.path.dirname(script_directory)
edge_directory = os.path.join(main_directory, "edge")
edge_assets_directory = os.path.join(edge_directory, "assets")
edge_logs_directory = os.path.join(edge_assets_directory, "logs")
edge_bestip_path = os.path.join(edge_directory, "Bestip.txt")
edge_result_path = os.path.join(edge_directory, "Endpoints.csv")
main_singbox_path = os.path.join(main_directory, "sing-box.json")
main_warp_path = os.path.join(main_directory, "warp.json")

# Function to create required directories
def create_directories():
    """Create all required directories if they don't exist"""
    directories = [
        edge_directory,
        edge_assets_directory,
        edge_logs_directory
    ]
    for directory in directories:
        if not os.path.exists(directory):
            os.makedirs(directory)
            logging.info(f"Created directory: {directory}")

# Function to create list of IP addresses
def create_ips():
    logging.info("Creating Bestip.txt file...")
    with open(edge_bestip_path, "w") as file:
        for cidr in warp_cidr:
            for addr in ipaddress.IPv4Network(cidr):
                file.write(f"{addr}\n")
    logging.info("Bestip.txt file created successfully!")

# Function to determine architecture suffix
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
        raise ValueError(
            "Unsupported CPU architecture. Supported architectures are: i386, i686, x86_64, amd64, armv8, arm64, aarch64, s390x"
        )

# Function to generate Hiddify config
def export_Hiddify(t_ips):
    config_prefix = f"warp://{t_ips[0]}?ifp=1-3&ifpm=m4#{IR_TAG}&&detour=warp://{t_ips[1]}?ifp=1-2&ifpm=m5#{SW_TAG}"
    formatted_time = datetime.datetime.now().strftime("%A, %d %b %Y, %H:%M")
    return config_prefix, formatted_time

# Function to generate Sing-box config
def toSingBox(tag, clean_ip, detour):
    logging.info(f"Generating Warp config for {tag}")
    
    # دانلود اسکریپت API
    api_script_path = "api.sh"
    try:
        subprocess.run(
            ["wget", "-N", "https://gitlab.com/fscarmen/warp/-/raw/main/api.sh"], 
            check=True, 
            capture_output=True, 
            text=True
        )
    except subprocess.CalledProcessError as e:
        logging.error(f"Failed to download api.sh: {e}")
        return None
    
    # اجرای اسکریپت API بدون sudo
    try:
        # تغییر مجوز فایل برای اجرا
        os.chmod(api_script_path, 0o755)
        
        # اجرای اسکریپت بدون sudo
        prc = subprocess.run(
            ["bash", api_script_path, "-r"], 
            capture_output=True, 
            text=True
        )
        
        if prc.returncode != 0:
            logging.error(f"api.sh execution failed with return code {prc.returncode}")
            logging.error(f"stderr: {prc.stderr}")
            return None
            
        output = prc.stdout
        logging.info(f"api.sh executed successfully")
    except Exception as e:
        logging.error(f"Error executing api.sh: {e}")
        return None
    finally:
        # حذف فایل موقت
        if os.path.exists(api_script_path):
            os.remove(api_script_path)
            logging.info("api.sh file removed.")
    
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
        logging.error(f"Raw output: {output}")
        return None

# Function to export Sing-box config
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

# Main function
def main():
    try:
        # ایجاد دایرکتوری‌های مورد نیاز
        create_directories()
        
        # ایجاد فایل Bestip.txt در صورت عدم وجود
        if os.path.exists(edge_bestip_path):
            logging.info("Bestip.txt file already exists.")
        else:
            create_ips()
        
        # تعیین معماری سیستم
        arch = arch_suffix()
        logging.info(f"System architecture: {arch}")
        
        # دانلود برنامه warp
        logging.info("Fetching warp program...")
        url = f"https://gitlab.com/Misaka-blog/warp-script/-/raw/main/files/warp-yxip/warp-linux-{arch}"
        warp_executable = os.path.join(edge_directory, "warp")
        
        try:
            # دانلود با wget
            subprocess.run(["wget", "-O", warp_executable, url], check=True)
            # تنظیم مجوز اجرا
            os.chmod(warp_executable, 0o755)
            logging.info("Warp program downloaded successfully.")
        except subprocess.CalledProcessError as e:
            logging.error(f"Failed to download warp program: {e}")
            raise
        
        # اجرای اسکن IP
        logging.info("Scanning IPs...")
        try:
            result = subprocess.run(
                [warp_executable], 
                check=True, 
                capture_output=True, 
                text=True,
                cwd=edge_directory  # اجرا در دایرکتوری edge
            )
            logging.info("Warp executed successfully.")
            logging.debug(f"Warp output: {result.stdout}")
        except subprocess.CalledProcessError as e:
            logging.error(f"Error executing warp: {e}")
            logging.error(f"stderr: {e.stderr}")
            raise
        
        # بررسی وجود فایل نتایج
        if not os.path.exists(edge_result_path):
            logging.error("Endpoints.csv was not generated by warp executable.")
            raise FileNotFoundError("Endpoints.csv was not generated by warp executable.")
        
        # خواندن بهترین IPها
        Bestip = []
        try:
            with open(edge_result_path, "r") as csv_file:
                next(csv_file)  # پرش از هدر
                for line in csv_file:
                    Bestip.append(line.split(",")[0])
                    if len(Bestip) == 2:
                        break
        except Exception as e:
            logging.error(f"Error reading Endpoints.csv: {e}")
            raise
        
        if len(Bestip) < 2:
            logging.error("Less than 2 clean IPs found in Endpoints.csv.")
            raise ValueError("Less than 2 clean IPs found in Endpoints.csv.")
        
        logging.info(f"Selected IPs: {Bestip}")
        
        # تولید کانفیگ Hiddify
        formatted_time = datetime.datetime.now().strftime("%a, %H:%M:%S")
        config_prefix, _ = export_Hiddify(Bestip)
        
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
            raise
        
        # تولید کانفیگ Sing-box
        export_SingBox(Bestip)
        
        logging.info("All configurations generated successfully!")
        
    except subprocess.CalledProcessError as e:
        logging.error(f"Error executing command: {e}")
        sys.exit(1)
    except Exception as e:
        logging.error(f"An unexpected error occurred: {e}")
        sys.exit(1)
    finally:
        # حذف فایل‌های موقت با استفاده از shutil که خطا را مدیریت می‌کند
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
