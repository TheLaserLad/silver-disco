# THIS APP WILL HANDLE ADMIN PROFILE REQUESTS 
# FROM DASHBOARD ADMIN CAN LOGIN THROUGHT THIS API VERIFICATION WILL BE DONE
# RAW PASSWORD WILL BE STORED ALONGSIDE THE NAME AND HASH TOKEN IN ENV FILE
# HASED PASSWORD WILL BE USED FOR VERIFICATION PURPOSES
# THE DASHBOARD DATA WILL BE FETCHED FROM THIS API ONLY
# SENT TO THE ALREADY EXISTING PINBALLRACE_COM MONGO DB DATABASE
# IT WILL HANDLE GAMES/PRIZES/PLAYERS DATA FORM DASHBOARD

# main.py
import os
import uuid
import base64
import re
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from urllib3 import request
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, Request, Form, Response, HTTPException, Query, Depends, UploadFile, File, BackgroundTasks,status 
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.hash import bcrypt
from pydantic import BaseModel
from dotenv import load_dotenv
import json
import zipfile
import csv
from jose import jwt, JWTError
import shutil
from TikTokLive import TikTokLiveClient
from utils.utils import router as utils_router
from utils.lp import router as lp_router
from utils.yolo_model import yolo_model
import championship
from championship import router as championship_router, country_flag, effective_streak, utc_now
from growth_admin import router as growth_router
from auth import require_self
from avatars import avatar_svg


load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "pinballrace_com")
SECRET_KEY = os.getenv("SECRET_KEY", "supersecret")
SESSION_EXPIRE_SECONDS = int(os.getenv("SESSION_EXPIRE_SECONDS", "86400"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 5
CHUNK_SIZE = 1024 * 1024
POS_POINT = { "1": 20, "2": 10, "3": 5, "4": 1, "5": 1 , "6": 1, "7": 1, "8": 1, "9": 1, "10": 1 ,"0":0}
OFF_POS_POINT = { "1": 10, "2": 5, "3": 3, "4": 1, "5": 1 , "6": 1, "7": 1, "8": 1, "9": 1, "10": 1 ,"0":0}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_OFFLINE_GAMES_PER_DAY = os.getenv("MAX_OFFLINE_GAMES_PER_DAY",3)
ADMIN_CONFIG_PATH = os.path.join("utils", "admin_config.json")
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pinballrace.com",
        "https://www.pinballrace.com",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)
app.include_router(utils_router)
app.include_router(lp_router)
app.include_router(championship_router)
app.include_router(growth_router)

app.mount("/screenshots", StaticFiles(directory="screenshots"), name="screenshots")

templates = Jinja2Templates(directory="templates")
templates.env.policies["json.dumps_kwargs"] = {"sort_keys": False}
app.mount("/static", StaticFiles(directory="static"), name="static")

# Mongo client
mongo = AsyncIOMotorClient(MONGO_URI)
db = mongo[DB_NAME]

EXPORT_DIR = "./db_exports"
ZIP_PATH = f"{EXPORT_DIR}/database_export.zip"

class UserEmail(BaseModel):
    email: str

class NotificationSettingsUpdate(BaseModel):
    userId: str # Keeping the name clear, even if the DB field is _id
    raceReminders: bool
    raceResults: bool
    competitionUpdates: bool
    weeklySummary: bool

class UpdateOfflineGameRequest(BaseModel):
    game_id: str
    rankings: Dict[str, Any] # Accepts the dictionary structure

class HistoryRequest(BaseModel):
    userId: str
    limit: int = 10  # Default to last 10 races
    gameType: str = "All" # Optional filter
    date: str = "today"  # Optional date filter

class GameModel(BaseModel):
    gameType: str
    numberOfBalls: int = 12
    bonusBalls: Optional[int] = 0
    starttimeofgame: int
    prizeId: str
    timerPerRace: str
    timerTillNextGame: str
    participants: List = []
    attempters: List = []
    winners: List = []
    status: str = "Not Started"
    gameNumber: int
    createdAt: int = int(datetime.now(timezone.utc).timestamp()*1000)
    endedAt: int

class DoorStatus(BaseModel):
    status: str  # "OPEN" or "CLOSED"

class OfflineGameRequest(BaseModel):
    userId: str
    ball_id: int
# a path to stream video based on _id input


async def generate_database_export():
    """Fetches all collections, writes them to CSVs, and zips them up."""
    os.makedirs(EXPORT_DIR, exist_ok=True)
    
    # Get all collections in the database
    collections = await db.list_collection_names()
    csv_files = []
    
    for coll_name in collections:
        cursor = db[coll_name].find({})
        docs = await cursor.to_list(length=None) 
        
        if not docs:
            continue
            
        # MongoDB documents can have dynamic keys. 
        # This scans all docs to find every possible column header.
        fieldnames = set()
        for doc in docs:
            fieldnames.update(doc.keys())
        fieldnames = list(fieldnames)
        
        csv_path = os.path.join(EXPORT_DIR, f"{coll_name}.csv")
        csv_files.append(csv_path)
        
        # Write to CSV
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for doc in docs:
                # Convert the MongoDB ObjectId to a string so it writes to CSV cleanly
                if '_id' in doc:
                    doc['_id'] = str(doc['_id'])
                writer.writerow(doc)
                
    # Bundle all CSVs into a single ZIP file for the client
    with zipfile.ZipFile(ZIP_PATH, 'w') as zipf:
        for file in csv_files:
            zipf.write(file, os.path.basename(file))
            
    print("Daily database export completed and zipped.")


@app.post("/api/games/offline")
async def create_offline_game(
    background_tasks: BackgroundTasks,
    youtube_link: str = Form(...), 
    result_screenshot: UploadFile = File(...),
    gameType: str = Form(...),
    prize: str = Form(...)
):
    ext = result_screenshot.filename.split(".")[-1]

    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"Invalid file extension. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # --- 2. Validate MIME Type (Content-Type) ---
    # This prevents someone from renaming 'virus.exe' to 'virus.jpg'
    if result_screenshot.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid file type. Only images are allowed."
        )

    # --- 3. Validate File Size ---
    # Read the file to determine size (FastAPI spools this in memory/temp file)
    # We seek to the end (0, 2) to get the total size
    result_screenshot.file.seek(0, 2)
    file_size = result_screenshot.file.tell()

    # IMPORTANT: Reset cursor to start so you can save the file later
    await result_screenshot.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"File too large. Limit is {MAX_FILE_SIZE / 1024 / 1024}MB"
        )
    # create an empty entry in games_off collection and get the _id back
    result = await db.games_off.insert_one({})
    game_id = result.inserted_id
    # save the video and frame in videos folder and the name will be _id
    
    image_path = f"screenshots/{game_id}_results.{ext}"
    
    with open(image_path, "wb") as buffer:
        shutil.copyfileobj(result_screenshot.file, buffer)

    time_now = int(datetime.utcnow().timestamp() * 1000)

    # 3. Initial DB Update (Status: Processing)
    await db.games_off.update_one({"_id": game_id}, {"$set": {
        "gameType": gameType,
        "prize": prize,
        "video_url": youtube_link,
        "result_image_path": image_path,
        "status": "processing", # Flag to show loader on frontend
        "createdAt": time_now
    }})

    # 4. Run Inference in Background
    # This prevents the request from timing out while YOLO loads/processes
    background_tasks.add_task(process_game_results, game_id, image_path)

    return RedirectResponse(url="/dashboard", status_code=303)

async def process_game_results(game_id, image_path):
    """
    Runs ONNX inference, sorts balls by position, and saves results as {name: rank}.
    """
    try:
        print(f"Starting processing for Game {game_id}...")

        # 1. Run Inference
        detected_objects = yolo_model.infer(image_path)
        
        if not detected_objects:
            print(f"No balls detected for game {game_id}")
            await db.games_off.update_one({"_id": game_id}, {"$set": {
                "rankings": {}, 
                "status": "completed_no_data"
            }})
            return
        
        # If you want Left-to-Right:
        sorted_objects = sorted(detected_objects, key=lambda obj: obj["box"][0])
        
        # If you want Top-to-Bottom (e.g. vertical drop):
        # sorted_objects = sorted(detected_objects, key=lambda obj: obj["box"][1])

        # 3. Generate Result Dictionary {'ball_X': rank}
        rankings_dict = {}
        for rank, obj in enumerate(sorted_objects):
            ball_name = obj["name"]
            # Rank is 1-based (1, 2, 3...), not 0-based
            rankings_dict[ball_name] = rank + 1

        print(f"Generated Rankings: {rankings_dict}")

        # 4. Update Database with the Dictionary
        await db.games_off.update_one({"_id": game_id}, {"$set": {
            "rankings": rankings_dict,  # Saves as {'ball_3': 1, 'ball_1': 2}
            "status": "completed"
        }})
        
        print(f"Game {game_id} updated successfully.")

    except Exception as e:
        print(f"Error processing game {game_id}: {e}")
        import traceback
        traceback.print_exc()
        await db.games_off.update_one({"_id": game_id}, {"$set": {"status": "failed"}})

def create_secure_video_link(youtube_url: str, user_id: str):
    """
    Generates a token containing the youtube_url and user_id.
    Returns the full URL endpoint with the token.
    """
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # We pack the YouTube URL into the token
    to_encode = {
        "sub": user_id,          # Subject (User ID)
        "target_url": youtube_url, # Store the actual YouTube URL here
        "exp": expire            # Expiration time
    }
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return f"https://admin.pinballrace.com/api/videos/secure-stream?token={encoded_jwt}"

@app.get("/api/videos/secure-stream")
async def secure_stream_video(token: str = Query(...)):
    try:
        # 1. Validate Token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        youtube_url = payload.get("target_url")
        
        if not youtube_url:
            raise HTTPException(status_code=403, detail="Invalid token content")
            
    except JWTError:
        raise HTTPException(status_code=403, detail="Link expired or invalid")

    # 2. Extract Video ID (Handles Shorts, Standard, and Share links)
    video_id = extract_youtube_id(youtube_url)
    
    if not video_id:
        # Fallback to direct link if parsing fails
        return RedirectResponse(url=youtube_url)

    # 3. Construct Embed URL
    # autoplay=1: Starts video immediately
    # controls=0: Hides player controls (optional, YouTube might still show some)
    # rel=0: Prevents showing unrelated videos at the end
    # playsinline=1: Plays inside the element on mobile (doesn't force fullscreen)
    embed_url = f"https://www.youtube.com/embed/{video_id}?autoplay=1&controls=0&rel=0&playsinline=1"

    # 4. Redirect the browser/iframe to this secure embed URL
    return RedirectResponse(url=embed_url)

def extract_youtube_id(url: str) -> str:
    """
    Robust regex to extract ID from:
    - youtube.com/shorts/ID
    - youtube.com/watch?v=ID
    - youtu.be/ID
    """
    if not url: return None
    pattern = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return None

# fnction taht will take user_ID and off_game id and then automatically add the 
async def process_off_game(game_id,user_id,ball_id):
    # first find the game
    now = datetime.utcnow()
    game = await db.games_off.find_one({"_id":ObjectId(game_id)})
    user = await db.users.find_one({"_id":ObjectId(user_id)})
    # fetch the rankings
    # On-demand races score lower than live ones (10/5/3/1 vs 20/10/5/1), and a
    # ball that finished outside the top 10 simply scores nothing.
    rank = game.get("rankings", {}).get("ball_" + str(ball_id))
    user_points = OFF_POS_POINT.get(str(rank), 0)

    parti_dict = {"userId": user_id,
                  "username": user["username"],
                  "createdAt": int(now.timestamp()),
                  "ball": str(ball_id),
                  "points": user_points,
                  "rank": rank if rank is not None else "999"
                  }
    await db.games_off.update_one({"_id":ObjectId(game_id)},
                                  {"$addToSet": {"participants": parti_dict}})

    # update users data 
    if user_points > 0:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$push": {"points": {"points":user_points,"timestamp":int(datetime.utcnow().timestamp())}}}
            )
        new_points = user.get("total_points", 0) + user_points
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"total_points": new_points}}
        )
    if rank == 1:
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$push": {"numberOfWins": {"wins": 1, "timestamp": int(datetime.utcnow().timestamp())}}}
        )
        new_streak = user.get("winningStreak", 0) + 1
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"winningStreak": new_streak}}
        )
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$push": {"racesPlayed": {"races": 1,"raceId": "offline", "user_ball": str(ball_id), "timestamp": int(datetime.utcnow().timestamp())}}}
    )
    # Feed the weekly championship, streak and career counters.
    try:
        await championship.record_race_result(
            user, rank if isinstance(rank, int) else None, user_points, game_type="offline"
        )
    except Exception as e:
        print(f"⚠️ championship hook failed for {user.get('username')}: {e}")
    return (str(rank) if rank is not None else "10+"), user_points
# it will receive credentials and return a random offline game url
@app.post("/api/games/offline/url")
async def get_offline_game_url(
    game_data: OfflineGameRequest # <--- Accepts JSON body
):

    now = datetime.utcnow()
    start_of_day = int(now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    user = await db.users.find_one(
        {"_id": ObjectId(game_data.userId)},
        {"racesPlayed": 1}
    )

    if user:
        daily_offline_plays = 0
        races_played = user.get("racesPlayed", [])
        
        # Count how many offline races were played today
        for race in races_played:
            if race.get("raceId") == "offline" and race.get("timestamp") >= start_of_day:
                daily_offline_plays += 1
        
        if daily_offline_plays >= int(MAX_OFFLINE_GAMES_PER_DAY):
            raise HTTPException(status_code=403, detail=f"Daily limit of {MAX_OFFLINE_GAMES_PER_DAY} offline games reached")
        
    pipeline = [
        # 1. Filter: Same conditions as before
        { "$match": { 
            "createdAt": { "$ne": None }, 
            "participants.userId": { "$ne": game_data.userId } 
        }},
        # 2. Random Sample: Pick 1 random document from the results
        { "$sample": { "size": 1 } }
    ]

    # Execute aggregation
    cursor = db.games_off.aggregate(pipeline)
    offline_game = await cursor.to_list(length=1)
    if not offline_game:
        raise HTTPException(status_code=404, detail="No offline game available")
    # process_off_game already reports "10+" for a ball that did not place.
    ranks, points = await process_off_game(offline_game[0]["_id"],game_data.userId,game_data.ball_id)
    secure_link = create_secure_video_link(offline_game[0]["video_url"], game_data.userId)
    return {"video_link": secure_link,
            "user_ball":"ball_"+ str(game_data.ball_id),
            "user_position":ranks,
            "user_points":points}


@app.post("/api/games/offline/delete")
async def delete_offline_game(
    request: Request,
    game_id: str = Form(...)
):
    await require_login(request)
    offline_game = await db.games_off.find_one({"_id": ObjectId(game_id)})
    if not offline_game:
        raise HTTPException(status_code=404, detail="Offline game not found")
    # delete video file too
    video_path = offline_game.get("video_path")
    if video_path and os.path.exists(video_path):
        os.remove(video_path)
    await db.games_off.delete_one({"_id": ObjectId(game_id)})
    return RedirectResponse(url="/dashboard", status_code=303)

@app.post("/api/games/offline/max_per_day")
async def update_offline_games(
    max_games: int = Form(...),
    # current_user: User = Depends(get_current_active_superuser) # Recommended for security
):
    global MAX_OFFLINE_GAMES_PER_DAY
    
    # 1. Update the variable in memory (Immediate effect)
    MAX_OFFLINE_GAMES_PER_DAY = max_games

    # 2. Update the .env file (Persistent effect)
    env_path = ".env"
    key = "MAX_OFFLINE_GAMES_PER_DAY"
    new_line = f"{key}={max_games}\n"
    
    # Read all lines
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
    else:
        lines = []

    # Write back with the update
    updated = False
    with open(env_path, "w") as f:
        for line in lines:
            # Check if this line is the specific variable
            if line.strip().startswith(f"{key}="):
                f.write(new_line)
                updated = True
            else:
                f.write(line)
        
        # If the variable wasn't in the file, add it to the end
        if not updated:
            # Ensure there is a newline before appending if file wasn't empty
            if lines and not lines[-1].endswith("\n"):
                f.write("\n")
            f.write(new_line)

    # 3. Redirect back to dashboard
    return RedirectResponse(url="/dashboard", status_code=303)

@app.post("/api/games/offline/update")
async def update_offline_game_rankings(payload: UpdateOfflineGameRequest):
    try:
        # validate ObjectId
        if not ObjectId.is_valid(payload.game_id):
            raise HTTPException(status_code=400, detail="Invalid Game ID")
            
        obj_id = ObjectId(payload.game_id)
        
        # Update the database
        result = await db.games_off.update_one(
            {"_id": obj_id},
            {"$set": {"rankings": payload.rankings}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Game not found")
            
        return {"status": "success", "message": "Rankings updated"}
        
    except Exception as e:
        print(f"Error updating game: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# ---------- Utilities ----------
async def get_next_sequence( name: str) -> int:
    """Auto-increment counter that resets daily."""
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Use a compound key so each day has its own counter
    key = f"{name}_{today}"

    r = await db.counters.find_one_and_update(
        {"_id": key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )

    return r["seq"]

def hash_password(plain: str) -> str:
    return bcrypt.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.verify(plain, hashed)
    except Exception:
        return False

async def leaderboard_entry(current_game, rankings):
    """Create leaderboard entries based on game results and rankings."""
    participants = current_game.get("participants", [])
    game_id = current_game["_id"]
    game_number = current_game["gameNumber"]
    game_type = current_game["gameType"]
    playedAt = current_game.get("createdAt","No Time")
    # players that selected first postion ball
    # fisrt ball is first item of rankings
    first_position_ball = None
    top_10_balls = []
    for ball_key, position in rankings.items():
        if position == 1:
            first_position_ball = int(ball_key.replace("ball_", ""))
        if position <=10:
            top_10_balls.append(int(ball_key.replace("ball_", "")))

    playername_with_first_ball = None 
    player_index = None
    for participant in participants:
        if participant.get("ball") == str(first_position_ball):
            playername_with_first_ball = participant.get("username")
            # get player index in participants
            player_index = participants.index(participant)
            break   
    if player_index is None:
        player_index = 1
    # get first position player details
    first_player_details = await db.users.find_one({"username": playername_with_first_ball})
    if first_player_details is None:
        first_player_details = {"username": "No First Player"}   
    races_played = sum(race.get("races", 0) for race in first_player_details.get("racesPlayed", [])) + 1
    winning_streak = first_player_details.get("winningStreak", 0) + 1
    # sum up all the wins from numberOfWins array
    wins = sum(win.get("wins", 0) for win in first_player_details.get("numberOfWins", [])) + 1
    points = first_player_details.get("total_points", 0) + POS_POINT.get("1", 0)
    # insert into leaderboard 
    # log the first position player details
    print(f"Logging leaderboard entry for player: {playername_with_first_ball}")
    await db.leaderboard.insert_one({
        "gameId": game_id,
        "raceId": game_number,
        "datePlayed": playedAt,
        "username": playername_with_first_ball,
        "player": player_index,
        "ballNumber": first_position_ball,
        "points": points,
        "position": 1,
        "top5Balls": top_10_balls,
        "races": races_played,
        "type": game_type,
        "winningStreak": winning_streak,
        "wins": wins,
    })
    return True

def adjust_rank(rank: str|int) -> str:
    """Converts '1' to '1st', '2' to '2nd', etc."""
    try:
        rank_num = int(rank)
        if rank_num == 999:
            return "N-A"
        if 10 <= rank_num % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank_num % 10, "th")
        return f"{rank_num}{suffix}"
    except ValueError:
        return str(rank)  # Return as-is if it's not a number

async def pastwinner_entry(current_game, rankings):
    """
    Create a past winners entry for the last race.
    This will save top 3 finishers into the 'past_winners' collection.
    """

    participants = current_game.get("participants", [])
    game_id = current_game["_id"]
    game_number = current_game["gameNumber"]
    game_type = current_game["gameType"]
    playedAt = current_game.get("createdAt", "No Time")

    finishers = []  

    for ball_key, pos in rankings.items():
        if pos <= 3:  
            ball_number = int(ball_key.replace("ball_", ""))

            username = "Unknown"
            for p in participants:
                if p.get("ball") == ball_number:
                    username = p.get("username", "Unknown")
                    break

            finishers.append({
                "username": username,
                "position": pos,
                "ball": ball_number,
                "time": "N/A"  
            })

    finishers = sorted(finishers, key=lambda x: x["position"])

    past_race_doc = {
        "raceId": game_number,
        "gameId": game_id,
        "mode": game_type,
        "datePlayed": playedAt,
        "duration": "N/A",        # TODO : calculate duration if possible
        "topFinishers": finishers
    }

    await db.past_winners.insert_one(past_race_doc)

    return True

async def scheduler():
    """Continuously manages game status transitions."""
    while True:
        # 1️⃣ Fetch all 'Not Started' games in order
        games_cursor = db.games.find({"status": "Not Started"}).sort("createdAt", 1)
        games = await games_cursor.to_list(length=None)
                
        if not games:
            await asyncio.sleep(30)
            continue

        print(f"🎯 Found {len(games)} 'Not Started' games to schedule")

        # 2️⃣ Start with the first game as 'initial'
        initial_game = games[0]

        # process all games one by one
        for i, game in enumerate(games):
            game_id = game["_id"]
            created_at = datetime.utcfromtimestamp(game["createdAt"] / 1000)
            timer_minutes = game["timerTillNextGame"]
            if timer_minutes is 0:
                sec = 30
            else:
                sec = 0
            start_time = created_at + timedelta(minutes=timer_minutes, seconds=sec)


            now = datetime.utcnow()
            wait_seconds = (start_time - now).total_seconds()
            if wait_seconds < 0:
                print(f"⚠️ Game {game_id} start time already passed, starting immediately. Wait: {wait_seconds:.2f}")
                wait_seconds = 0

            print(f"🕒 Game {i+1}: {game_id} will start in {wait_seconds:.2f}s")

            # 3️⃣ Wait until the start time
            await asyncio.sleep(wait_seconds)

            # 4️⃣ Mark as Ongoing
            await db.games.update_one(
                {"_id": game_id},
                {"$set": {"status": "Ongoing"}}
            )
            print(f"🚀 Game {game_id} is now Ongoing")

            interval = 5  # check every 5 seconds if game was force-finished
            elapsed = 0
            while True:
                await asyncio.sleep(interval)
                elapsed += interval

                # Check if game was force-finished externally
                ongoing = await db.games.find_one({"_id": game_id, "status": "Ongoing"})
                if not ongoing:
                    print(f"⚡ Game {game_id} was force finished. Moving on.")
                    break

                # check for endAt time if endAT found then stop the game
                if "endedAt" in ongoing and ongoing["endedAt"] > 0:
                    print(f"⚡ Game {game_id} has ended at {ongoing['endedAt']}. Moving on.")
                    # mark as finished
                    await db.games.update_one(
                        {"_id": game_id},
                        {"$set": {"status": "Finished"}}
                    )
                    break
        print("✅ All pending games processed. Waiting for new games...")
        await asyncio.sleep(30)

async def create_session(username: str) -> str:
    sid = base64.urlsafe_b64encode(uuid.uuid4().bytes).decode().rstrip("=")
    expires_at = datetime.utcnow() + timedelta(seconds=SESSION_EXPIRE_SECONDS)
    await db.sessions.insert_one({
        "_id": sid,
        "username": username,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at
    })
    return sid

async def fetch_prize(prize_id: str) -> Optional[Dict[str, Any]]:
    prize = await db.prizes.find_one({"_id": ObjectId(prize_id)})
    if prize == None:
        print(f"Prize with id {prize_id} not found.")
    return prize['title'] if prize else None

async def create_points_only_prize() -> str:
    # we can have the id stored in .env
    points_only_prize_id = os.getenv("POINTS_ONLY_PRIZE_ID")
    if points_only_prize_id:
        existing = await db.prizes.find_one({"_id": points_only_prize_id})
        if existing:
            return existing["_id"]

    # check if a Points Only entry exists
    existing = await db.prizes.find_one({"title": "Points Only"})
    if existing:
        os.environ["POINTS_ONLY_PRIZE_ID"] = str(existing["_id"])
        return str(existing["_id"])

    prize_doc = {
        "title": "Points Only",
        "description": "No physical prize, points only reward.",
        "createdAt": datetime.utcnow()
    }
    result = await db.prizes.insert_one(prize_doc)
    os.environ["POINTS_ONLY_PRIZE_ID"] = str(result.inserted_id)

    return str(result.inserted_id)

async def get_session(sid: str):
    if not sid: 
        return None
    s = await db.sessions.find_one({"_id": sid})
    if not s:
        return None
    if s.get("expires_at") and s["expires_at"] < datetime.utcnow():
        await db.sessions.delete_one({"_id": sid})
        return None
    return s

async def require_login(request: Request):
    sid = request.cookies.get("session_id")
    session = await get_session(sid)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    return session["username"]

def format_timestamp(timestamp: int) -> str:
    """Convert millisecond timestamp to readable date string"""
    try:
        dt = datetime.fromtimestamp(timestamp / 1000.0)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return 'N/A'


# ---------- Auth endpoints ----------
@app.get("/login", response_class=HTMLResponse)
async def login_form(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})

@app.post("/login")
async def login(request: Request, response: Response, username: str = Form(...), password: str = Form(...)):
    # Admin user stored in collection 'admins'
    admin = await db.admins.find_one({"username": username})
    if admin and "password_hash" in admin:
        if verify_password(password, admin["password_hash"]):
            sid = await create_session(username)
            resp = RedirectResponse(url="/dashboard", status_code=302)
            resp.set_cookie("session_id", sid, httponly=True, secure=False, samesite="lax")  # secure=True when using HTTPS via nginx
            return resp
        elif username == os.environ.get("ADMIN_USERNAME") and password == os.environ.get("ADMIN_PASSWORD"):
            # update hash
            password_hash = hash_password(password)
            await db.admins.update_one({"username": username}, {"$set": {"password_hash": password_hash}})
            sid = await create_session(username)
            resp = RedirectResponse(url="/dashboard", status_code=302)
            resp.set_cookie("session_id", sid, httponly=True, secure=False, samesite="lax")  # secure=True when using HTTPS via nginx
            return resp
        else:
            return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid credentials"})
    else:
        # Optionally allow first-run create admin if env provided
        env_admin = os.getenv("ADMIN_USERNAME")
        env_pass = os.getenv("ADMIN_PASSWORD")
        env_hash = os.getenv("ADMIN_PASSWORD_HASH")
        if env_admin and username == env_admin and (env_pass or env_hash):
            if env_hash:
                pwok = verify_password(password, env_hash)
            else:
                pwok = (password == env_pass)
            if pwok:
                # create persistent admin doc
                password_hash = env_hash if env_hash else hash_password(password)
                # save new hashed password in env for future restarts
                os.environ["ADMIN_PASSWORD_HASH"] = password_hash
                await db.admins.update_one({"username": username}, {"$set": {"username": username, "password_hash": password_hash}}, upsert=True)
                sid = await create_session(username)
                resp = RedirectResponse(url="/dashboard", status_code=302)
                resp.set_cookie("session_id", sid, httponly=True, secure=False, samesite="lax")
                return resp
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid credentials"})

@app.get("/logout")
async def logout(request: Request):
    sid = request.cookies.get("session_id")
    if sid:
        await db.sessions.delete_one({"_id": sid})
    resp = RedirectResponse(url="/login", status_code=302)
    resp.delete_cookie("session_id")
    return resp

# ---------- Dashboard & templates ----------
@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse("/login")

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")
    
    prizes = await db.prizes.find().to_list(length=1000)
    next_game = await db.games.find_one({"status": "Not Started"}, sort=[("createdAt", 1)])
    current_game = await db.games.find_one({"status": "Ongoing"}, sort=[("createdAt", 1)])
    off_games = await db.games_off.find().to_list(length=1000)
    # in off_games change the timestamp to actaual date also remove empty createdAt entries
    for og in off_games:
        if "createdAt" in og:
            og["createdAt_formatted"] = format_timestamp(og["createdAt"])
        else:
            off_games.remove(og)
        if "rankings" in og and isinstance(og["rankings"], dict):
            # sorted() takes the dict items, sorts them by value (x[1]), and dict() puts them back together
            og["rankings"] = dict(sorted(og["rankings"].items(), key=lambda item: item[1]))
    context = {
        "request": request,
        "username": username,
        "prizes": prizes,
        "offGames": off_games,
        "nextGame": next_game,
        "currentGame": current_game,
        "max_non_live_games": MAX_OFFLINE_GAMES_PER_DAY,
    }
    return templates.TemplateResponse("dashboard.html", context)

@app.get("/nonlivegames",response_class=HTMLResponse)
async def nonlivegame(request: Request):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")
    off_games = await db.games_off.find().to_list(length=1000)
    for og in off_games:
        if "createdAt" in og:
            og["createdAt_formatted"] = format_timestamp(og["createdAt"])
        else:
            off_games.remove(og)
        if "rankings" in og and isinstance(og["rankings"], dict):
            # sorted() takes the dict items, sorts them by value (x[1]), and dict() puts them back together
            og["rankings"] = dict(sorted(og["rankings"].items(), key=lambda item: item[1]))
    context = {
        "request": request,
        "username": username,
        "offGames": off_games,
        "max_non_live_games": MAX_OFFLINE_GAMES_PER_DAY,
}
    
    return templates.TemplateResponse("nonlivegames.html", context)

def load_config() -> dict:
    """Safely loads the config, returning a default template if it doesn't exist."""
    if os.path.exists(ADMIN_CONFIG_PATH):
        try:
            with open(ADMIN_CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading config: {e}")
            
    # Default structure if file is missing or corrupted
    return {
        "next_race_time": None,
        "is_live": False,
        "tiktok_live_url": None,
        "sponsors": []
    }

def save_config(data: dict):
    """Writes the dictionary back to the JSON file."""
    try:
        with open(ADMIN_CONFIG_PATH, "w") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save configuration.")

@app.post("/api/admin/set-time")
async def set_next_race_time(
    request: Request,
    next_race_time: str = Form(...) # The HTML form sends this as 'YYYY-MM-DDTHH:MM'
):
    """Handles the timer setting, converting the datetime to a timestamp."""
    config_data = load_config()
    
    try:
        # 1. Parse the string from the HTML datetime-local input
        dt = datetime.strptime(next_race_time, "%Y-%m-%dT%H:%M")
        
        # 2. Force minutes, seconds, and microseconds to 0 (rounding to the hour)
        dt = dt.replace(minute=0, second=0, microsecond=0)
        
        # 3. Convert to a UNIX timestamp (integer)
        timestamp = int(dt.timestamp())
        
        # 4. Save the timestamp to config
        config_data["next_race_time"] = timestamp
    except ValueError as e:
        print(f"Error parsing date: {e}")
        raise HTTPException(status_code=400, detail="Invalid date format provided.")
    
    save_config(config_data)
    
    return RedirectResponse(url="/landing-settings", status_code=303)

@app.post("/api/admin/set-sponsor")
async def set_sponsor(
    request: Request,
    sponsor_title: str = Form(...),
    sponsor_logo: Optional[UploadFile] = File(None) # <--- Changed this line
):
    """Handles the sponsor configuration and converts the image to base64."""
    # 1. Read the image file from memory
    file_bytes = await sponsor_logo.read()
    
    # 2. Convert to base64 string
    base64_encoded = base64.b64encode(file_bytes).decode('utf-8')
    
    # 3. Format it as a Data URI so HTML <img> tags can render it natively
    mime_type = sponsor_logo.content_type or "image/png"
    base64_data_uri = f"data:{mime_type};base64,{base64_encoded}"
    
    # 4. Load current config
    config_data = load_config()
    
    # 5. Update the sponsor data (Storing as a single active sponsor here, 
    # but you could append to the list if you want multiple)
    config_data["sponsors"] = [{
        "name": sponsor_title,
        "logo": base64_data_uri
    }]
    
    # 6. Save back to the JSON file
    save_config(config_data)
    
    # 7. Redirect back to the settings page
    return RedirectResponse(url="/landing-settings", status_code=303)

@app.get("/landing-settings", response_class=HTMLResponse)
async def ls(request: Request):
    # 1. Verify the admin is logged in
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse(url="/login", status_code=303)
    
    # 2. Load the current configuration
    current_config = load_config() 

    # 3. Format the saved timestamp back to HTML format for the frontend
    formatted_time = ""
    saved_timestamp = current_config.get("next_race_time")
    if saved_timestamp:
        try:
            # Convert timestamp back to a datetime object
            dt = datetime.fromtimestamp(saved_timestamp)
            # Format exactly as HTML datetime-local expects: YYYY-MM-DDTHH:MM
            formatted_time = dt.strftime("%Y-%m-%dT%H:%M")
        except Exception as e:
            print(f"Error formatting timestamp: {e}")

    # 4. Prepare the context for Jinja2
    context = {
        "request": request,
        "username": username,
        "current_config": current_config,
        "formatted_time": formatted_time # Inject our formatted time
    }
    
    # 5. Render and return the HTML template
    return templates.TemplateResponse("lp.html", context)

async def get_past_winners_report():
    """
    Fetches finished games, calculates participant positions based on ball rankings,
    and returns a flattened list of winners sorted by Game Date -> Rank -> User Points.
    """
    
    # 1. Query: Finished, Has Rankings, Has Participants (>0)
    query = {
        "status": "Finished",
        "ball_rankings": {"$exists": True, "$ne": {}}, # Ensure rankings exist and not empty
        "participants.0": {"$exists": True} # Efficient way to check array length > 0
    }

    # 2. Cursor: Sort by createdAt Descending (Latest games first)
    cursor = db.games.find(query).sort("createdAt", -1)

    report_data = []

    async for game in cursor:
        game_rankings = game.get("ball_rankings", {})
        participants = game.get("participants", [])
        
        # Parse Date (Handle Millisecond Timestamp)
        created_at_ts = game.get("createdAt")
        if created_at_ts:
            # Convert ms to seconds
            dt_object = datetime.fromtimestamp(created_at_ts / 1000.0)
            date_str = dt_object.strftime("%Y-%m-%d %H:%M:%S")
        else:
            date_str = "N/A"

        # 3. Process Participants for this specific game
        processed_participants = []
        
        for p in participants:
            # Determine Rank
            # Participant has ball "9", ranking key is "ball_9"
            user_ball_key = f"ball_{p.get('ball')}"
            
            # Get rank from rankings. If ball didn't finish, give it a high rank (last)
            rank = game_rankings.get(user_ball_key, 9999)
            
            processed_participants.append({
                "data": p,
                "rank": rank
            })

        # 4. Sort Participants: 
        # Primary Key: Rank (Ascending - 1, 2, 3...)
        # Secondary Key: Original Points (Descending - High points first for ties)
        processed_participants.sort(key=lambda x: (x['rank'], -x['data'].get('points', 0)))

        # 5. Format Output for this game's players
        for entry in processed_participants:
            user_data = entry['data']
            
            # Optional: You can filter here if you ONLY want the #1 winner
            # if entry['rank'] > 1: continue 

            report_data.append({
                "username": user_data.get("username", "Unknown"),
                "email": user_data.get("email", "N/A"),
                "prize": game.get("prizeTitle", "N/A"),
                "gameId": game.get("gameNumber", "N/A"),
                "gameType": game.get("gameType", "Regular"),
                "createdAt_formatted": date_str,
                # Optional: I added these internally for debugging, remove if strict on keys
                # "Rank": entry['rank'], 
                # "Ball": user_data.get("ball")
            })

    return report_data

@app.get("/past-winners", response_class=HTMLResponse)
async def past_winners_page(request: Request):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")
    
    past_winners = await get_past_winners_report()    
    context = {
        "request": request,
        "username": username,
        "pastWinners": past_winners,
    }
    return templates.TemplateResponse("past_winners.html", context)


@app.get("/email-all", response_class=HTMLResponse)
async def email_all_page(request: Request):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")
    users = await db.users.find({"email": {"$exists": True, "$ne": ""}}, {"_id": 0, "username": 1, "email": 1}).to_list(length=5000)
    return templates.TemplateResponse("email_all.html", {
        "request": request,
        "username": username,
        "users": users,
        "total_users": len(users),
        "success": None,
        "error": None,
        "sent_count": 0,
    })


@app.post("/api/email/send-all")
async def api_email_send_all(request: Request, subject: str = Form(...), body: str = Form(...)):
    username = await require_login(request)

    users = await db.users.find(
        {"email": {"$exists": True, "$ne": ""}},
        {"_id": 0, "username": 1, "email": 1}
    ).to_list(length=5000)
    emails = [u["email"] for u in users if u.get("email")]

    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
    SMTP_USER = os.getenv("SMTP_USER")
    SMTP_PASS = os.getenv("SMTP_PASS")

    error, sent = None, 0
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASS)
            for email in emails:
                msg = MIMEMultipart()
                msg["From"] = SMTP_USER
                msg["To"] = email
                msg["Subject"] = subject
                msg.attach(MIMEText(body, "plain"))
                smtp.sendmail(SMTP_USER, email, msg.as_string())
                sent += 1
    except Exception as e:
        error = str(e)

    return templates.TemplateResponse("email_all.html", {
        "request": request, "username": username,
        "users": users, "total_users": len(users),
        "success": sent > 0 and not error,
        "error": error, "sent_count": sent,
    })


@app.get("/analytics", response_class=HTMLResponse)
async def analytics_page(request: Request, period: str = "all"):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")

    now = datetime.now(timezone.utc)
    period_deltas = {"1d": timedelta(days=1), "1w": timedelta(weeks=1), "1m": timedelta(days=30), "1y": timedelta(days=365)}
    cutoff = now - period_deltas[period] if period in period_deltas else None
    cutoff_ms = int(cutoff.timestamp() * 1000) if cutoff else None

    signup_filter = {"createdAt": {"$gte": cutoff_ms}} if cutoff_ms else {}
    game_filter   = {"createdAt": {"$gte": cutoff_ms}} if cutoff_ms else {}

    period_signups       = await db.users.count_documents(signup_filter)
    period_live_games    = await db.games.count_documents(game_filter)
    period_nonlive_games = await db.games_off.count_documents(game_filter)

    total_users         = await db.users.count_documents({})
    total_live_games    = await db.games.count_documents({})
    total_nonlive_games = await db.games_off.count_documents({})
    total_winners       = await db.games.count_documents({"winners": {"$exists": True, "$not": {"$size": 0}}})
    # the very recently played live game id is the one with the latest createdAt timestamp
    very_recent_live_game_id = await db.games.find_one({}, sort=[("createdAt", -1)], projection={"_id": 1})

    total_users_list         = await db.users.find({}).to_list(length=None)
    for i, user in enumerate(total_users_list):
        if user["createdAt"] >= int((now - timedelta(hours=30)).timestamp() * 1000):
            total_users_list[i]["recent_signup"] = True
        else:
            total_users_list[i]["recent_signup"] = False
        total_live_games_played = 0
        total_nonlive_games_played = 0
        for game in user.get("racesPlayed", []):
            if game.get("raceId") != "offline":
                total_live_games_played += 1
                # match the game id with the very_recent_live_game_id to mark recent live game played
                if very_recent_live_game_id and game.get("raceId") == str(very_recent_live_game_id["_id"]):
                    total_users_list[i]["recent_live_game_played"] = True
            else:
                total_nonlive_games_played += 1
                
        total_users_list[i]["createdAt_formatted"] = format_timestamp(user["createdAt"])
        total_users_list[i]["total_live_games_played"] = total_live_games_played
        total_users_list[i]["total_nonlive_games_played"] = total_nonlive_games_played
        # if the recent_live_game_played is not set, set it to False
        if "recent_live_game_played" not in total_users_list[i]:
            total_users_list[i]["recent_live_game_played"] = False

    live_players    = await db.users.count_documents({"racesPlayed": {"$elemMatch": {"raceId": {"$ne": "offline"}}}})
    nonlive_players = await db.users.count_documents({"racesPlayed": {"$elemMatch": {"raceId": "offline"}}})
    both_players    = await db.users.count_documents({"$and": [
        {"racesPlayed": {"$elemMatch": {"raceId": {"$ne": "offline"}}}},
        {"racesPlayed": {"$elemMatch": {"raceId": "offline"}}}
    ]})
    never_played = await db.users.count_documents({"$or": [
        {"racesPlayed": {"$exists": False}},
        {"racesPlayed": {"$size": 0}}
    ]})

    return templates.TemplateResponse("analytics.html", {
        "request": request, "username": username, "period": period,
        "period_signups": period_signups,
        "period_live_games": period_live_games,
        "period_nonlive_games": period_nonlive_games,
        "total_users": total_users,
        "live_players": live_players,
        "nonlive_players": nonlive_players,
        "both_players": both_players,
        "never_played": never_played,
        "total_live_games": total_live_games,
        "total_nonlive_games": total_nonlive_games,
        "total_winners": total_winners,
        "total_users_list": total_users_list
    })


# ---------- API endpoints to mirror your React functions ----------
@app.post("/api/games/new")
async def api_new_game(
    request: Request,
    gameType: str = Form(...),
    timerTillNextGame: str = Form(...),
    prize: str = Form(...)
):
    await require_login(request)
    
    if prize == "Points Only":
        prize = await create_points_only_prize()
    
    game_number = await get_next_sequence("gameNumber")
    prize_title = await fetch_prize(prize) if prize else "Points Only"
    # game_number is game_number+ddmmyyyy
    game_number = f"{game_number}{datetime.utcnow().strftime('%d%m%Y')}"
    # Convert timer to minutes for storage
    timer_minutes = int(timerTillNextGame)
    
    game_doc = {
        "status": "Not Started",
        "gameType": gameType,
        "gameNumber": game_number,
        "numberOfBalls": 12,
        "bonusBalls": 0,
        "prizeId": prize,
        "prizeTitle": prize_title,
        "timerTillNextGame": timer_minutes,
        "participants": [],
        "kicked": [],
        "attempters": [],
        "winners": [],
        "createdAt": int(datetime.utcnow().timestamp() * 1000)
    }
    
    await db.games.insert_one(game_doc)
    return RedirectResponse("/dashboard", status_code=303)


@app.post("/api/games/forcefinish")
async def api_force_finish_game(request: Request):
    await require_login(request)
    ongoing_game = await db.games.find_one({"status": "Ongoing"})
    if not ongoing_game:
        raise HTTPException(status_code=404, detail="No ongoing game found")
    await db.games.update_one(
        {"_id": ongoing_game["_id"]},
        {"$set": {"status": "Finished", "endedAt": int(datetime.utcnow().timestamp() * 1000)}}
    )
    return RedirectResponse(url="/dashboard", status_code=303)

@app.post("/api/games/update")
async def api_update_current_game(request: Request,
                                  winners: Optional[str] = Form(""),
                                  raceWinners: Optional[str] = Form(""),
                                  kick_ids: Optional[str] = Form(""),
                                  add_ids: Optional[str] = Form(""),
                                  game_id: str = Form("")):
    await require_login(request)
    # parse logic similar to your React handlers
    update_ops = {}
    if winners:
        arr = [s.strip() for s in winners.split(",") if s.strip()]
        update_ops["winners"] = arr
        update_ops["status"] = "Finished"
        update_ops["endedAt"] = int(datetime.utcnow().timestamp()*1000)
    if raceWinners:
        arr = [s.strip() for s in raceWinners.split(",") if s.strip()]
        update_ops["raceWinners"] = arr

    if kick_ids:
        arr = [s.strip() for s in kick_ids.split(",") if s.strip()]
        await db.games.update_one(
            {"_id": game_id},
            {"$pull": {"participants": {"participantId": {"$in": arr}}}}
        )

    if add_ids:
        arr = [s.strip() for s in add_ids.split(",") if s.strip()]
        new_players = [{"participantId": a, "participantName": a, "ball": None} for a in arr]
        await db.games.update_one(
            {"_id": game_id},
            {"$push": {"participants": {"$each": new_players}}}
        )

    if update_ops:
        await db.games.update_one({"_id": game_id}, {"$set": update_ops})

    return RedirectResponse("/dashboard", status_code=303)


@app.get("/api/games/status")
async def get_game_status():
    current_game = await db.games.find_one({"status": "Ongoing"})
    next_game = await db.games.find_one({"status": "Not Started"})
    return JSONResponse({
        "currentGame": {
            "gameNumber": current_game.get("gameNumber") if current_game else None,
            "status": current_game.get("status") if current_game else None
        } if current_game else None,
        "nextGame": {
            "gameNumber": next_game.get("gameNumber") if next_game else None,
            "status": next_game.get("status") if next_game else None
        } if next_game else None
    })

@app.post("/api/prizes/new")
async def api_new_prize(request: Request, title: str = Form(...), description: str = Form("")):
    await require_login(request)
    await db.prizes.insert_one({
        "title": title,
        "description": description,
        "createdAt": datetime.utcnow()
    })
    return RedirectResponse("/dashboard", status_code=303)
@app.get("/api/avatar/{user_id}")
async def api_avatar(user_id: str):
    """
    A generated avatar for a player who has not set one.

    Exists for clients that get their pfp from the Node API (the account screen
    reads /api/user/me there, and that payload has no fallback applied) — they
    can point an <img> straight at this instead of reimplementing the drawing.
    Payloads built by this service inline the same image, so they need no extra
    request; see avatars.py.

    Deliberately unauthenticated: it exposes only a username's initials, which
    are already on every public leaderboard, and gating it would mean avatars
    vanish on exactly the pages that render them for logged-out visitors.

    Returns an avatar even for an id that matches no user, rather than 404ing —
    a broken image icon in a leaderboard row is worse than a generic silhouette.
    """
    name = None
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"username": 1})
        if user:
            name = user.get("username")
    except Exception:
        # A malformed id is a caller mistake, not a reason to fail the render.
        pass

    return Response(
        content=avatar_svg(user_id, name),
        media_type="image/svg+xml",
        # Deterministic output, so it caches hard. A day is short enough that a
        # rename catches up on its own without a cache-busting query param.
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/api/users/all")
async def api_get_all_users(request: Request):
    await require_login(request)
    users = await db.users.find({}, {"_id": 1, "username": 1, "email": 1}).to_list(length=500)
    return [
        {"id": str(u["_id"]), "name": u.get("username", "Unknown"), "email": u.get("email", "")}
        for u in users
    ]

def safe_ts(value):
    if isinstance(value, datetime):
        return int(value.replace(tzinfo=timezone.utc).timestamp())
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(value)
    except:
        return None


@app.post("/api/user/stats")
async def user_stats(request: Request, user_email_data: UserEmail):
    """
    Returns user stats for dashboard based on email provided in the request body.

    Despite the field name, `email` carries the user's _id. Only the account
    holder may read their own stats.
    """
    email = user_email_data.email
    await require_self(request, email)

    # Retrieve user based on email instead of cookie/userId
    user = await db.users.find_one({"_id": ObjectId(email)})
    
    if not user:
        raise HTTPException(499, f"User with id '{email}' not found.")
    # Extract lists OR default to empty
    wins_list = user.get("numberOfWins", []) or []
    races_list = user.get("racesPlayed", []) or []
    points_list = user.get("points", []) or []

    total_wins = sum(
        w.get("wins", 0)
        for w in wins_list
        if (ts := safe_ts(w.get("timestamp"))) is not None
    )

    total_races = sum(
        r.get("races", 0)
        for r in races_list
        if (ts := safe_ts(r.get("timestamp"))) is not None
    )

    total_points = sum(
        p.get("points", 0)
        for p in points_list
        if (ts := safe_ts(p.get("timestamp"))) is not None
    )

    streak = user.get("winningStreak", 0)

    now_ts = int(datetime.now(timezone.utc).timestamp())
    weekly_points = [
        p for p in points_list
        if (ts := safe_ts(p.get("timestamp"))) is not None and now_ts - ts <= 7 * 24 * 60 * 60
    ]
    daily_points = {}
    for p in weekly_points:
        ts = safe_ts(p.get("timestamp"))
        day = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        daily_points[day] = daily_points.get(day, 0) + p.get("points", 0)
    trend = []
    for i in range(7):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        trend.append({
            "date": day,
            "points": daily_points.get(day, 0)
        })
    # need to create points distribution over time based on timestamps and points matching race played to calculate 11+ position
    # step 1 get list of points and race from user
    point_entries = user.get("points", [])
    # create a dict of points with timestamp as key
    points_over_time = {}
    for p in point_entries:
        ts = safe_ts(p.get("timestamp"))
        if ts is not None:
            points_over_time[ts] = p.get("points", 0)

    race_entries = user.get("racesPlayed", [])
    points_dict_per_position = {}
    for p in race_entries:
        ts = safe_ts(p.get("timestamp"))
        if ts is not None:
            # get race
            race = p.get("races", 0)
            if race != 0:
                # get points for race
                points = points_over_time.get(ts, 0)
                if points == 20:
                    points_dict_per_position["1"] = points_dict_per_position.get("1", 0) + 1
                elif points == 10:
                    points_dict_per_position["2"] = points_dict_per_position.get("2", 0) + 1
                elif points == 5:
                    points_dict_per_position["3"] = points_dict_per_position.get("3", 0) + 1
                elif points == 1:
                    points_dict_per_position["4-10"] = points_dict_per_position.get("4-10", 0) + 1
                else:
                    points_dict_per_position["11+"] = points_dict_per_position.get("11+", 0) + 1
        # favourite balls from racesPlayed get all the user_ball and count frequency
        # user_ball is a str like '3'or '10' etc
        favorite_balls = {}
        for r in race_entries:
            ts = safe_ts(r.get("timestamp"))
            if ts is not None:
                b = r.get("user_ball", '')
                if b:
                    favorite_balls[b] = favorite_balls.get(b, 0) + 1
        # create a list of favorite balls sorted by frequency
        favorite_balls_list = sorted(favorite_balls, key=favorite_balls.get, reverse=True)[:5]

        # convert items from str to int for ball number
        for i in range(len(favorite_balls_list)):
            try:
                favorite_balls_list[i] = int(favorite_balls_list[i])
            except:
                # remove the non convertible entry
                faltu = favorite_balls_list.pop(i)
    return {
        "username": user.get("username"),
        "totalWins": total_wins,
        "totalRaces": total_races,
        "points": total_points,
        "streak": streak,
        "weeklyTrend": list(reversed(trend)),  # reverse to have oldest first
        "pointsOverTime": points_dict_per_position,
        "favoriteBalls": favorite_balls_list
    }

@app.get("/api/user/notifications/{user_id}")
async def get_notifications(request: Request, user_id: str):
    """Fetches user notification settings. Returns defaults if not set."""
    await require_self(request, user_id)
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=499, detail="User not found")

        # Default settings if the user hasn't set them yet
        defaults = {
            "raceReminders": True,
            "raceResults": True,
            "competitionUpdates": True,
            "weeklySummary": True
        }
        
        # Return what's in the DB, or the defaults
        return user.get("notifications", defaults)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user/notifications")
async def update_notifications(request: Request, data: NotificationSettingsUpdate):
    """Updates or creates the notification settings for a user."""
    await require_self(request, data.userId)
    try:
        user_id = ObjectId(data.userId)
        user = await db.users.find_one({"_id": user_id})
        
        if not user:
            raise HTTPException(status_code=499, detail="User not found")

        new_settings = {
            "raceReminders": data.raceReminders,
            "raceResults": data.raceResults,
            "competitionUpdates": data.competitionUpdates,
            "weeklySummary": data.weeklySummary
        }

        # $set will create the "notifications" object if it doesn't exist
        await db.users.update_one(
            {"_id": user_id},
            {"$set": {"notifications": new_settings}}
        )

        return {"message": "Notifications updated successfully", "notifications": new_settings}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


LEADERBOARD_CACHE = {
"today": {"last_update": None, "data": []},
    "yesterday": {"last_update": None, "data": []},
    "last_7_days": {"last_update": None, "data": []},
    "last_30_days": {"last_update": None, "data": []},
    "last_90_days": {"last_update": None, "data": []},
    "last_12_months": {"last_update": None, "data": []},
    "all_time": {"last_update": None, "data": []},
}

CACHE_REFRESH_MINUTES = 2

# TODO: Handle "Custom Date" logic
def get_time_range(timeline: str):
    now = datetime.now(timezone.utc)

    TIMELINE_MAP = {
        "today": "today",
        "yesterday": "yesterday",
        "last 7 days": "last_7",
        "last 30 days": "last_30",
        "last 90 days": "last_90",
        "12 months": "last_12_months",
        "all time": "all",
        "custom date": "custom"
    }

    key = timeline.strip().lower()

    if key not in TIMELINE_MAP:
        # check if it matches custom date format "YYYY-MM-DD - YYYY-MM-DD"
        if " - " not in timeline:
            raise HTTPException(400, f"Invalid timeline: {timeline}")
    try:
        timeline_key = TIMELINE_MAP[key]
    except:
        timeline_key = key
    # NOW PROCESS
    if timeline_key == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now

    elif timeline_key == "yesterday":
        y = now - timedelta(days=1)
        start = y.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)

    elif timeline_key == "last_7":
        start = now - timedelta(days=7)
        end = now

    elif timeline_key == "last_30":
        start = now - timedelta(days=30)
        end = now

    elif timeline_key == "last_90":
        start = now - timedelta(days=90)
        end = now

    elif timeline_key == "last_12_months":
        start = now - timedelta(days=365)
        end = now

    elif timeline_key == "all":
        start = datetime.min.replace(tzinfo=timezone.utc)
        end = now
    # here is an example of custom range
    # "2025-12-22 - 2025-12-31"
    # in else we can parse the dates
    else:
        try:
            # split by " - "
            parts = timeline.split(" - ")
            if len(parts) != 2:
                raise ValueError("Invalid custom date format")
            start_str = parts[0].strip()
            end_str = parts[1].strip()
            start = datetime.strptime(start_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            end = datetime.strptime(end_str, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1) - timedelta(seconds=1)
        except Exception as e:
            raise HTTPException(400, f"Invalid custom date format: {timeline}") from e
    # convert start and end to int
    start = int(start.timestamp())
    end = int(end.timestamp())
    print(f"Timeline '{timeline}' resolved to range {start} - {end}")
    return start, end


async def compute_leaderboard(start_ts, end_ts,timeline_key):
    """Compute leaderboard from DB and update cache."""
    users_cursor = db.users.find({})
    users = await users_cursor.to_list(None)

    new_data = []

    # One instant for the whole pass, so a rebuild that straddles midnight does
    # not credit some players against today and others against yesterday.
    now = utc_now()

    for user in users:
        username = user.get("username", "Unknown")

        wins_list = user.get("numberOfWins", [])
        races_list = user.get("racesPlayed", [])
        points_list = user.get("points", [])

        total_wins = sum(w.get("wins", 0)
                         for w in wins_list
                         if "timestamp" in w and start_ts <= w["timestamp"] <= end_ts)

        total_races = sum(r.get("races", 0)
                          for r in races_list
                          if "timestamp" in r and start_ts <= r["timestamp"] <= end_ts)

        total_points = sum(p.get("points", 0)
                           for p in points_list
                           if "timestamp" in p and start_ts <= p["timestamp"] <= end_ts)
        if total_points == 0:
            continue
        new_data.append({
            # userId is what makes the name clickable — the profile popup is
            # keyed on it, and usernames are not guaranteed unique.
            "userId": str(user["_id"]),
            "username": username,
            "numberOfWins": total_wins,
            "races": total_races,
            "points": total_points,
            # The flag and streak the championship standings show beside a name.
            # This board reads the same user documents, so carry them here too
            # rather than leaving the two boards looking like different products.
            # Both are resolved as the cache is filled, which bounds how stale
            # they can get to CACHE_REFRESH_MINUTES.
            "country": user.get("country", ""),
            "flag": country_flag(user.get("country")),
            "currentStreak": effective_streak(user, now),
        })

    # ---- Sort by points only (DESC) ----
    new_data.sort(key=lambda x: x["points"], reverse=True)

    # Update cache
    LEADERBOARD_CACHE[timeline_key] = {
            "data": new_data,
            "last_update": datetime.now(timezone.utc)
        }


def cache_expired(timeline_key):
    """Return True if cache for specific timeline is expired or doesn't exist."""
    if timeline_key not in LEADERBOARD_CACHE:
        return True
    
    last = LEADERBOARD_CACHE[timeline_key].get("last_update")
    if last is None:
        return True
        
    # Check if 5 minutes have passed
    return datetime.now(timezone.utc) - last > timedelta(minutes=CACHE_REFRESH_MINUTES)

@app.get("/api/leaderboard")
async def leaderboard_new(timeline: str):
    """
    Ultra-fast leaderboard with:
    - Background caching
    - Auto refresh
    - Sorted by points only
    """
    start_ts, end_ts = get_time_range(timeline)
    timeline_key = timeline.lower().replace(" ", "_") 
    
    # TODO: Handle "Custom Date" logic here
    if timeline_key == "custom_date":
         return {"data": [], "message": "Custom date not implemented yet"}

    # Check if cache is expired OR if key is missing entirely
    if cache_expired(timeline_key):
        # LOGIC CHANGE: 
        # We ALWAYS await the computation. We do not use background tasks anymore.
        # This ensures the user gets the latest data right now.
        await compute_leaderboard(start_ts, end_ts, timeline_key)

    # Retrieve from cache (It is guaranteed to be fresh now)
    cached_entry = LEADERBOARD_CACHE.get(timeline_key, {"data": [], "last_update": None})

    return {
        "timeline": timeline_key,
        "cached_at": cached_entry.get("last_update"),
        "refreshing": False, # It's never refreshing in background anymore
        "data": cached_entry.get("data", [])
    }

async def _leaderboard_data_for(timeline: str):
    """
    Adapter handed to championship.py so /api/leaderboard/active can fall back
    to this all-time leaderboard whenever no championship is running.
    """
    start_ts, end_ts = get_time_range(timeline)
    timeline_key = timeline.lower().replace(" ", "_")
    if cache_expired(timeline_key):
        await compute_leaderboard(start_ts, end_ts, timeline_key)
    return LEADERBOARD_CACHE.get(timeline_key, {}).get("data", [])

def get_participant_by_ball(participants: List[Dict], ball_num: str):
    """Finds a participant dict (username, etc.) given a ball number."""
    for p in participants:
        if str(p.get("ball")) == str(ball_num):
            return p
    return None

async def _decorate_finishers(races: List[Dict[str, Any]]) -> None:
    """
    Add each top-3 finisher's flag and streak to `races`, in place.

    A game document snapshots a participant's name and ball at join time and
    nothing else, so the country and streak have to be read from the user
    documents. Every finisher across every race is resolved in one query — doing
    it per row would turn a 50-race history into 150 round trips.

    A finisher whose user record is gone (or whose id was never recorded) is
    left with an empty flag and a zero streak rather than dropped, so the race
    still lists who actually placed.
    """
    ids = {
        f["userId"]
        for race in races
        for f in race.get("topFinishers", [])
        if f.get("userId")
    }

    lookup: Dict[str, Dict[str, Any]] = {}
    if ids:
        oids = []
        for raw in ids:
            try:
                oids.append(ObjectId(raw))
            except (InvalidId, TypeError):
                continue  # malformed participant id: just goes undecorated

        if oids:
            now = utc_now()
            cursor = db.users.find(
                {"_id": {"$in": oids}},
                {"country": 1, "currentStreak": 1, "lastActiveDate": 1},
            )
            async for u in cursor:
                lookup[str(u["_id"])] = {
                    "flag": country_flag(u.get("country")),
                    "currentStreak": effective_streak(u, now),
                }

    for race in races:
        for f in race.get("topFinishers", []):
            found = lookup.get(f.get("userId"), {})
            f["flag"] = found.get("flag", "")
            f["currentStreak"] = found.get("currentStreak", 0)


@app.post("/api/user/race-history")
async def get_race_history(request: Request, req: HistoryRequest):
    """
    Fetches game history for a specific user.
    Returns data formatted for the RaceHistory.jsx component.
    """
    await require_self(request, req.userId)
    
    # 1. Build Query
    # We look for games where 'participants.userId' matches the requested userId
    query = {
        "status": "Finished" # Only show finished games
    }
    off_query = {}
    # Apply optional Game Type filter
    if req.gameType != "All":
        query["gameType"] = req.gameType
    if req.date:
        try:
            start_t, end_t = get_time_range(req.date)
            query["createdAt"] = {"$gte": start_t * 1000, "$lte": end_t * 1000}
            off_query["participants.createdAt"] = {"$exists": True,"$gte": start_t , "$lte": end_t }
        except HTTPException as e:
            raise HTTPException(400, f"Invalid date filter: {req.date}") from e

    # 2. Execute Query (Sort by newest first)
    cursor = db.games.find(query).sort("createdAt", -1).limit(req.limit)
    # gametype not all or offline then dont send the game_off data

    races_data = []

    async for game in cursor:
        try:
            # --- A. Basic Info ---
            if not game.get("startedAt"):
                start_ts = int(game.get("createdAt"))
            else:
                start_ts = int(game.get("startedAt"))
            end_ts = int(game.get("endedAt"))
            duration_ms = end_ts - start_ts
            
            total_seconds = int(duration_ms / 1000)
            minutes = total_seconds // 60
            seconds = total_seconds % 60
            duration_str = f"{minutes}:{seconds:02d}"

            # --- B. Rank ALL Participants ---
            rankings = game.get("ball_rankings", {}) # { "ball_12": 1, "ball_5": 2 }
            participants = game.get("participants", [])
            
            processed_finishers = []

            for p in participants:
                # 1. Get the ball this user picked
                b_num = str(p.get("ball"))
                
                # 2. Get the Rank of that ball
                # If ball didn't finish, give it rank 999 (DNF)
                rank_key = f"ball_{b_num}"
                ball_rank = rankings.get(rank_key, 999) 
                
                # 3. Get User Points (Tie-breaker)
                # Defaults to 0 if not saved in the game document
                user_points = p.get("points", 0) 

                processed_finishers.append({
                    "participant": p,
                    "ball_rank": ball_rank,   # Primary Sort: Lower is better
                    "user_points": user_points, # Secondary Sort: Higher is better
                    "ball_num": b_num
                })

            # --- C. Sort Logic ---
            # Sort by: 
            # 1. Ball Rank (Ascending) -> 1st place beats 2nd place
            # 2. User Points (Descending) -> If both are 1st, higher points wins
            processed_finishers.sort(key=lambda x: (x["ball_rank"], -x["user_points"]))

            # --- D. Find "You" (The User) ---
            
            user_position_str = "No Entry"
            user_ball_num = "?"
            
            # Find index of current user in the sorted list
            for i, entry in enumerate(processed_finishers):
                p = entry["participant"]
                
                # Check if this entry is the current user
                if str(p.get("userId")) == str(req.userId):
                    user_ball_num = entry["ball_num"]
                    
                    # Only assign a rank if the ball actually finished (rank < 999)
                    if entry["ball_rank"] < 999:
                        # this will be equal to ball rank 
                        actual_rank = entry["ball_rank"]
                        
                        # Format ordinal (1st, 2nd, 11th, etc)
                        suffix = "th" if 11 <= actual_rank <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(actual_rank % 10, "th")
                        user_position_str = f"{actual_rank}{suffix}"
                    else:
                        user_position_str = "10+"
                    break #? why this break?

            # --- E. Process Top 3 Finishers ---
            top_finishers = []
            
            # Take the top 3 from our SORTED list of users
            for i, entry in enumerate(processed_finishers[:3]):
                # If this entry is a DNF (rank 999), stop adding to top 3
                if entry["ball_rank"] >= 999:
                    break

                p = entry["participant"]
                rank = entry["ball_rank"] # actual rank is ball_rank
                
                # Name Logic
                w_name = p.get("username", "Unknown")
                if str(p.get("userId")) == str(req.userId):
                    w_name = "You"

                # Ordinal
                w_suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank, "th")

                top_finishers.append({
                    "userId": str(p.get("userId") or ""),
                    "name": w_name,
                    "position": f"{rank}{w_suffix}",
                    "time": duration_str,
                    "ball": f"Ball {entry['ball_num']}",
                    "iconType": "crown" if rank == 1 else "medal1" if rank == 2 else "medal2"
                })

            # --- F. Construct Final Object ---
            races_data.append({
                "id": f"#{game.get('gameNumber', str(game['_id'])[-8:])}",
                "mode": game.get("gameType", "Regular"),
                "startTimestamp": start_ts,
                "endTimestamp": end_ts,
                "duration": duration_str,
                "position": user_position_str,
                "yourBall": f"Ball {user_ball_num}",
                "topFinishers": top_finishers
            })

        except Exception as e:
            print(f"Error processing game {game.get('_id')}: {e}")
            continue
    if req.gameType != "All" and req.gameType != "Offline":
        off_cursor_game = []
    else:
        off_cursor_game = db.games_off.find(off_query).sort("participants.createdAt", -1).limit(req.limit)
        async for games in off_cursor_game:
            # add a minute to createAt to make it look like a real game and add duration of 1 minute to end timestamp
            end_ts = games["createdAt"] + 60*1000
            duration_str = "1:00"
            
            participants = games.get("participants", [])
            rankings = games.get("rankings", {})
            
            user_position_str = "No Entry"
            user_ball_num = "?"
            top_finishers = []
            
            # 1. Find ONLY the current user in participants
            user_data = next((p for p in participants if str(p.get("userId")) == str(req.userId)), None)
            
            if user_data:
                user_ball_num = user_data.get("ball", "?")
                # Ensure we match the exact key format in your DB (e.g., "ball_5")
                ball_key = f"ball_{user_ball_num}"
                
                # 2. Check if the user's ball is in the rankings
                if ball_key in rankings:
                    rank = rankings[ball_key]
                    
                    # Format position suffix (1st, 2nd, 3rd, 4th...)
                    if 11 <= rank <= 13:
                        suffix = "th"
                    else:
                        suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank % 10, "th")
                        
                    user_position_str = f"{rank}{suffix}"
                    
                    # 3. Append ONLY the user to topFinishers since they are ranked
                    top_finishers.append({
                        "userId": str(user_data.get("userId") or ""),
                        "name": "You",
                        "position": user_position_str,
                        "time": duration_str,
                        "ball": f"Ball {user_ball_num}",
                        "iconType": "crown" if rank == 1 else "medal1" if rank == 2 else "medal2"
                    })
                else:
                    # User participated but wasn't ranked
                    user_position_str = "10+"

            races_data.append({
                "id": "Offline", # Good practice to pass stringified ID if possible
                "mode": "Regular-Offline",
                "startTimestamp": games["createdAt"],
                "endTimestamp": end_ts,
                "duration": duration_str,
                "position": user_position_str,
                "yourBall": f"Ball {user_ball_num}",
                "topFinishers": top_finishers
            })

    # sort races_data by startTimestamp in descending order
    races_data.sort(key=lambda x: x["startTimestamp"], reverse=True)
    # After both the online and offline passes, so one query covers every race.
    await _decorate_finishers(races_data)
    return races_data

@app.get("/api/leaderboard/recent")
async def get_recent_races(username: Optional[str] = Query(None)):
    try:
        query_filter = {"username": username} if username else {}
        # and participants.createdAt should be available for games_off to sort by recent games
        if username:
            off_query_filter = {"participants.username": username,
                            "participants.createdAt": {"$exists": True}} if username else {"participants.createdAt": {"$exists": True}}
            off_cursor = db.games_off.find(off_query_filter).sort("participants.createdAt", -1).limit(100)
            games_off_list = await off_cursor.to_list(length=4)  
        else:
            games_off_list = []
        live_query_filter = {"participants.username": username} if username else {}
        
        # 2. Use $lookup to join 'games' with 'leaderboard' on gameNumber == raceId
        pipeline = [
            {"$match": live_query_filter},
            {"$sort": {"createdAt": -1}},
            {"$limit": 100},
            {"$lookup": {
                "from": "leaderboard",
                "localField": "gameNumber",
                "foreignField": "raceId",
                "as": "leaderboard_data"
            }}
        ]
        
        live_cursor = db.games.aggregate(pipeline)
        live_games_list = await live_cursor.to_list(length=100) # Increased length to match limit
        #TODO: apply loop to leaderboard and games_off_list
        # get _id (for offline is offline), username,top5Balls
        # get games_off id offline, username = participants.username, top5balls = participants.ball converted to int
        res_data = []
        for game in live_games_list:
            # Extract top5Balls from the joined leaderboard array (if it exists)
            lb_data = game.get("leaderboard_data", [])
            top5 = lb_data[0].get("top5Balls", []) if lb_data else []
            
            # Resolve username (if no specific username was queried, default to the first participant)
            target_username = username
            if not target_username and game.get("participants"):
                target_username = game["participants"][0].get("username", "No Winner")
            elif not target_username:
                target_username = "No Winner"
                
            data = {
                "raceId": game.get("gameNumber"),
                "username": target_username,
                "top5Balls": top5,
                "isOffline": False,
                "position": "0", # Keeping this as "0" to match your original structure
                "createdAt": int(game.get("createdAt"))/1000
            }
            res_data.append(data)
        for games in games_off_list:
            # only the number remove the "ball_"
            winning_balls = []
            for rank_key, _ in games.get("rankings", {}).items():
                ball_num = rank_key.replace("ball_", "")
                winning_balls.append(int(ball_num))
            for parts in games["participants"]:
                rank = adjust_rank(parts["rank"])
                if parts["username"] == username:
                    data = {}
                    data["raceId"] = "On-Demand"
                    data["username"] = parts["username"]
                    data["top5Balls"] = winning_balls
                    data["position"] = rank
                    data["isOffline"] = True
                    data["createdAt"]= parts["createdAt"]
                    res_data.append(data)

        # sort res_data by createdAt in descending order
        def get_sort_time(x):
            val = x["createdAt"]
            if isinstance(val, datetime):
                return val.timestamp() # Converts datetime to float
            try:
                return float(val) # Handles existing floats, ints, or numeric strings
            except (ValueError, TypeError):
                return 0.0 # Fallback for corrupted/missing data

        # sort res_data by normalized createdAt in descending order
        res_data.sort(key=get_sort_time, reverse=True)
        return res_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/prizes/delete")
async def api_delete_prize(request: Request, prize_id: str = Form(...)):
    await require_login(request)
    await db.prizes.delete_one({"_id": ObjectId(prize_id)})
    return RedirectResponse("/dashboard", status_code=303)

@app.post("/api/game_ongoing")
async def game_ongoing():
    # this will be called by the detection script to check if a game is ongoing and no startedAt timestamp exists
    current_game = await db.games.find_one({"status": "Ongoing", "startedAt": {"$exists": False}})
    if current_game:
        return {"status": True}
    else:
        return {"status": False}

@app.post("/api/door/status")
async def door_status(status: DoorStatus):
    # this will receive the door status from the detection script
    # once the gate is opened the game with ongoing status should be updated and a startedAt timestamp should be added
    if status.status == "OPEN":
        current_game = await db.games.find_one({"status": "Ongoing"})
        if current_game and not current_game.get("startedAt"):
            await db.games.update_one(
                {"_id": current_game["_id"]},
                {"$set": {"startedAt": int(datetime.utcnow().timestamp() * 1000)}}
            )

        return {"status": "success", "message": "Door status recorded"}
    else:
        return {"status": "success", "message": "Door closed status recorded"}


# Add more endpoints as needed (past winners listing, deleting games, etc.)
@app.post("/api/submit_rankings")
async def submit_rankings(rankings: Dict[str, int]):
    # This endpoint can be used to receive ball rankings from the detection script
    # For now, we will just log them and return a success response
    print("Received ball rankings:", rankings)
    current_game = await db.games.find_one({"status": "Ongoing"})
    # in current game add the ball rankings in ball_ rankings
    if current_game:
        await db.games.update_one(
            {"_id": current_game["_id"]},
            {"$set": {"ball_rankings": rankings}}
        )

        # extract the participants
        participants = current_game.get("participants", [])
        if participants:
            for participant in participants:
                # get userId or email direct from participant
                participant_id = participant.get("userId") or participant.get("email") or participant.get("participantId")
                ball_number = participant.get("ball")
                ball_number_str = "ball_" + str(ball_number)
                if ball_number_str in rankings:
                    position = rankings[ball_number_str]
                    points = POS_POINT.get(str(position), 0)
                    # update user total_points in users collection and in points add like this {"points": {points},{utc time now}}
                    # racePlayed  will be store like this "racesPlayed": +1, utc time now
                    # numberOfWins +1 if position is 1,2,3 and utc time now
                    user = await db.users.find_one({"$or": [{"_id": ObjectId(participant_id)}, {"email": participant_id}]})
                    if user:
                        new_points = user.get("total_points", 0) + points
                        await db.users.update_one(
                            {"_id": user["_id"]},
                            {"$set": {"total_points": new_points}}
                        )
                        await db.users.update_one(
                            {"_id": user["_id"]},
                            {"$push": {"points": {"points": points, "timestamp": int(datetime.utcnow().timestamp())}}}
                        )
                        # update numberOfWins if position is 1,2,3
                        if position in [1]:
                            await db.users.update_one(
                                {"_id": user["_id"]},
                                {"$push": {"numberOfWins": {"wins": 1, "timestamp": int(datetime.utcnow().timestamp())}}}
                            )
                        # create streak in user
                        if position == 1:
                            new_streak = user.get("winningStreak", 0) + 1
                            await db.users.update_one(
                                {"_id": user["_id"]},
                                {"$set": {"winningStreak": new_streak}}
                            )
                        else:
                            # reset streak
                            await db.users.update_one(
                                {"_id": user["_id"]},
                                {"$set": {"winningStreak": 0}}
                            )
                        # increment the racesPlayed
                        await db.users.update_one(
                            {"_id": user["_id"]},
                            {"$push": {"racesPlayed": {"races": 1,"raceId": current_game["_id"], "user_ball": participant.get("ball"), "timestamp": int(datetime.utcnow().timestamp())}}}
                        )
                        # Feed the weekly championship, streak and career counters.
                        try:
                            await championship.record_race_result(
                                user, position, points, game_type="live"
                            )
                        except Exception as e:
                            # A championship failure must never lose a race result.
                            print(f"⚠️ championship hook failed for {user.get('username')}: {e}")
        await leaderboard_entry(current_game, rankings)
        # mark current game as Finished
        # add endedAt time no need to update status as Finished will be handled by the scheduler
        await db.games.update_one(
            {"_id": current_game["_id"]},
            {"$set": {"endedAt": int(datetime.utcnow().timestamp() * 1000)}}
        )
        await db.games.update_one(
            {"_id": current_game["_id"]},
            {"$set": {"status": "Finished"}}
        )

    return {"status": "success", "message": "Rankings received"}


@app.delete("/api/account/deletion")
async def account_deletion(request: Request, user_id: str = Query("")):
    """
    Flags the caller's own account for deletion.

    The route previously embedded a query string in the path
    ("/api/account/deletion?user_id={ID}"), which FastAPI matches literally, so
    it was unreachable; it was also a sync def calling motor without awaiting,
    so the update never ran even if it had been reached.
    """
    authenticated_id = await require_self(request, user_id)
    try:
        await db.users.update_one(
            {"_id": ObjectId(authenticated_id)},
            {"$set": {"deletion_requested": True, "deletion_requested_at": int(datetime.utcnow().timestamp())}}
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}
    return {"status": "success"}


@app.get("/is_live")
async def is_admin_live():
    """
    Checks if a specific TikTok user is currently live.
    Returns True if live, False if offline or not found.
    """
    # Initialize the client with the admin's username (can be with or without the '@')
    client = TikTokLiveClient(unique_id="@pinballrace")
    
    try:
        # retrieve_room_info fetches the live room status from TikTok's backend
        # without actually connecting your server to the live chat websocket.
        islive = await client.is_live()
        
    except Exception as e:
        print(e)
        return {"is_live":False}
    
    return {"is_live": islive}

@app.get("/api/admin/download-database")
async def download_database(
    request : Request
):
    try:
        username = await require_login(request)
    except HTTPException:
        return RedirectResponse("/login")
    await generate_database_export()
    """Allows the client to download the latest database snapshot."""
    if not os.path.exists(ZIP_PATH):
        # If the file doesn't exist yet, you can trigger a manual generation or throw an error
        raise HTTPException(status_code=404, detail="Export file not ready yet. Please try again later.")
        
    return FileResponse(
        path=ZIP_PATH, 
        media_type="application/zip", 
        filename="pinballrace_db_backup.zip"
    )



# ---------- Startup: ensure counters exist ----------
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(scheduler())
    # Championship rollover runs as its own task: scheduler() above sleeps for
    # the full countdown of the next game, which would delay the Monday 00:00
    # UTC rollover by up to that long.
    championship.set_fallback_leaderboard(_leaderboard_data_for)
    asyncio.create_task(championship.championship_scheduler())
    env_admin = os.getenv("ADMIN_USERNAME")
    env_pass = os.getenv("ADMIN_PASSWORD")
    env_hash = os.getenv("ADMIN_PASSWORD_HASH")
    # points only prize check on startup
    await create_points_only_prize()
    if env_admin and (env_pass or env_hash):
        existing = await db.admins.find_one({"username": env_admin})
        if not existing:
            pw = env_hash if env_hash else hash_password(env_pass)
            await db.admins.insert_one({"username": env_admin, "password_hash": pw})
    await db.counters.update_one({"_id": "gameNumber"}, {"$setOnInsert": {"seq": 0}}, upsert=True)