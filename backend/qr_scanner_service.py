#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import cv2
import numpy as np
import time
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import json
from pyzbar.pyzbar import decode
import threading
import argparse

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global variables
camera = None
last_qr_code = None
last_qr_time = 0
qr_lock = threading.Lock()
camera_active = False
current_camera_index = 0
available_cameras = []

def check_available_cameras():
    """Check which camera indices are available"""
    global available_cameras
    available_cameras = []
    
    # Try camera indices from 0 to 2 (limit to avoid too many errors)
    for i in range(3):
        try:
            cap = cv2.VideoCapture(i, cv2.CAP_ANY)
            if cap.isOpened():
                available_cameras.append(i)
                cap.release()
        except Exception as e:
            print(f"Error checking camera {i}: {e}")
    
    print(f"Available cameras: {available_cameras}")
    return available_cameras

def initialize_camera(camera_index=0):
    """Initialize the camera with the given index"""
    global camera, camera_active, current_camera_index
    
    # Close the current camera if it's open
    if camera is not None and camera.isOpened():
        camera.release()
    
    try:
        # Try to open the specified camera using the default backend
        camera = cv2.VideoCapture(camera_index, cv2.CAP_ANY)
        
        # Check if camera was opened successfully
        if not camera.isOpened():
            print(f"Failed to open camera {camera_index}")
            # Try different backends if the default fails
            for backend in [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_V4L2]:
                try:
                    camera = cv2.VideoCapture(camera_index, backend)
                    if camera.isOpened():
                        print(f"Camera {camera_index} opened with backend {backend}")
                        break
                except Exception as e:
                    print(f"Error trying backend {backend}: {e}")
        
        # Set resolution - try 720p
        if camera.isOpened():
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            camera_active = True
            current_camera_index = camera_index
            print(f"Successfully initialized camera {camera_index}")
            return True
        else:
            camera_active = False
            print(f"Failed to initialize camera {camera_index} with any backend")
            return False
            
    except Exception as e:
        camera_active = False
        print(f"Exception initializing camera {camera_index}: {e}")
        return False

def read_qr_code(frame):
    """Read QR code from an image frame"""
    # Convert to grayscale
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Try to decode QR codes
    qr_codes = decode(gray)
    
    for qr_code in qr_codes:
        # Extract the data
        qr_data = qr_code.data.decode('utf-8')
        
        # Draw a rectangle around the QR code
        points = qr_code.polygon
        if len(points) > 4:
            hull = cv2.convexHull(np.array([point for point in points], dtype=np.float32))
            cv2.polylines(frame, [hull], True, (0, 255, 0), 2)
        else:
            cv2.polylines(frame, [np.array(points, dtype=np.int32)], True, (0, 255, 0), 2)
            
        # Draw the data text
        cv2.putText(frame, qr_data, (qr_code.rect.left, qr_code.rect.top - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        return qr_data
    
    return None

def generate_frames():
    """Generate a stream of webcam frames with QR detection"""
    global camera, last_qr_code, last_qr_time, camera_active
    
    if camera is None or not camera.isOpened():
        print("Error: Camera not initialized or cannot be opened")
        # Return a placeholder frame with error message
        placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder, "Camera not available", (50, 240), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        ret, buffer = cv2.imencode('.jpg', placeholder)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        return
    
    consecutive_errors = 0
    max_consecutive_errors = 5
    
    while camera_active:
        try:
            success, frame = camera.read()
            if not success:
                consecutive_errors += 1
                print(f"Failed to read frame, error {consecutive_errors}/{max_consecutive_errors}")
                
                if consecutive_errors >= max_consecutive_errors:
                    print("Too many consecutive errors, stopping camera")
                    camera_active = False
                    break
                
                # Create an error frame
                error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(error_frame, "Camera read error", (50, 240), 
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                ret, buffer = cv2.imencode('.jpg', error_frame)
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                time.sleep(0.5)  # Wait a bit before trying again
                continue
            
            # Reset error counter on successful read
            consecutive_errors = 0
            
            # Try to detect QR code
            qr_data = read_qr_code(frame)
            
            # If we found a QR code, update the global variable
            if qr_data:
                with qr_lock:
                    last_qr_code = qr_data
                    last_qr_time = time.time()
                    print(f"Detected QR code: {qr_data}")
            
            # Encode the frame as JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # Yield the frame in the MJPEG format
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        except Exception as e:
            print(f"Error processing frame: {e}")
            consecutive_errors += 1
            
            if consecutive_errors >= max_consecutive_errors:
                print("Too many consecutive errors, stopping camera")
                camera_active = False
                break
                
            time.sleep(0.5)  # Short delay to prevent CPU overuse in case of errors

@app.route('/video_feed')
def video_feed():
    """Route for streaming video with QR detection"""
    if not camera_active:
        return jsonify({"error": "Camera is not active"}), 500
        
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/qr_result')
def qr_result():
    """Return the last detected QR code"""
    global last_qr_code, last_qr_time
    
    with qr_lock:
        # Only return QR codes that were detected in the last 5 seconds
        if last_qr_code and (time.time() - last_qr_time) < 5:
            result = {
                "qr_code": last_qr_code,
                "timestamp": last_qr_time
            }
            # Clear the QR code after returning it
            last_qr_code = None
            return jsonify(result)
    
    return jsonify({"qr_code": None})

@app.route('/switch_camera', methods=['POST'])
def switch_camera():
    """Switch to a different camera"""
    global available_cameras, current_camera_index
    
    data = request.json
    camera_index = data.get('camera_index')
    
    # If no specific index is provided, cycle through available cameras
    if camera_index is None:
        # Find the next available camera
        if len(available_cameras) > 0:
            current_idx = available_cameras.index(current_camera_index) if current_camera_index in available_cameras else -1
            next_idx = (current_idx + 1) % len(available_cameras)
            camera_index = available_cameras[next_idx]
        else:
            return jsonify({"error": "No cameras available"}), 404
    
    success = initialize_camera(camera_index)
    
    if success:
        return jsonify({
            "camera_index": camera_index,
            "message": f"Switched to camera {camera_index}"
        })
    else:
        return jsonify({"error": f"Failed to switch to camera {camera_index}"}), 500

@app.route('/start_camera', methods=['POST'])
def start_camera():
    """Start or restart the camera"""
    global camera_active
    
    data = request.json
    camera_index = data.get('camera_index', current_camera_index)
    
    success = initialize_camera(camera_index)
    
    if success:
        return jsonify({
            "camera_index": camera_index,
            "message": f"Camera {camera_index} started successfully"
        })
    else:
        return jsonify({"error": f"Failed to start camera {camera_index}"}), 500

@app.route('/stop_camera', methods=['POST'])
def stop_camera():
    """Stop the camera"""
    global camera, camera_active
    
    if camera is not None and camera.isOpened():
        camera_active = False
        camera.release()
        return jsonify({"message": "Camera stopped successfully"})
    else:
        return jsonify({"message": "Camera was not active"})

@app.route('/available_cameras')
def get_available_cameras():
    """Get a list of available camera indices"""
    cameras = check_available_cameras()
    return jsonify({"cameras": cameras})

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "camera_active": camera_active,
        "current_camera": current_camera_index,
        "available_cameras": available_cameras
    })

def parse_arguments():
    parser = argparse.ArgumentParser(description='QR Code Scanner Server')
    parser.add_argument('--port', type=int, default=5005, help='Port to run the server on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to run the server on')
    parser.add_argument('--camera', type=int, default=0, help='Camera index to use')
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_arguments()
    
    try:
        # Check available cameras
        check_available_cameras()
        
        # Initialize camera
        if len(available_cameras) > 0:
            initial_camera = args.camera if args.camera in available_cameras else available_cameras[0]
            camera_success = initialize_camera(initial_camera)
            if not camera_success:
                print("Warning: Could not initialize the primary camera. Will continue without active camera.")
                print("Users will need to manually enable a camera or use manual entry.")
        else:
            print("Warning: No cameras detected. Service will run but without camera functionality.")
            print("Users will need to use manual code entry instead.")
        
        # Run the Flask app
        print(f"Starting QR scanner server on {args.host}:{args.port}")
        app.run(host=args.host, port=args.port, debug=False, threaded=True)
    except Exception as e:
        print(f"Error starting QR scanner service: {e}")
        print("Please check your camera connections and try again.")
        input("Press Enter to exit...")
