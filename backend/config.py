import os
from dotenv import load_dotenv

load_dotenv()

IMMICH_BASE_URL = os.environ["IMMICH_BASE_URL"]
IMMICH_API_KEY = os.environ["IMMICH_API_KEY"]
DATABASE_PATH = os.environ.get("DATABASE_PATH", "/data/thoughtful_frame.db")
