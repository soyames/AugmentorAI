import uvicorn
import multiprocessing
import sys
import os

if __name__ == "__main__":
    multiprocessing.freeze_support()
    # Add the current directory to sys.path so 'app' module is found
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=8010)
