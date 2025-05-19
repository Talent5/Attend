#!/usr/bin/env python
# -*- coding: utf-8 -*-

import cv2
import numpy as np
import time
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import threading
from pyzbar.pyzbar import decode
import os
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

def initialize_camera(camera_index=0):
    """Initialize the camera with the given index"""
    global camera, camera_active, current_camera_index
    
    # Close the current camera if it's open
    if camera is not None:
        try:
            camera.release()
        except:
            pass
    
    # Try to open the specified camera with DirectShow (Windows)
    try:
        camera = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
        
        if camera.isOpened():
            camera_active = True
            current_camera_index = camera_index
            print(f"Successfully initialized camera {camera_index}")
            return True
        else:
            print(f"Failed to open camera {camera_index} with DirectShow")
            # Try with default backend
            camera = cv2.VideoCapture(camera_index)
            if camera.isOpened():
                camera_active = True
                current_camera_index = camera_index
                print(f"Successfully initialized camera {camera_index} with default backend")
                return True
            else:
                camera_active = False
                print(f"Failed to initialize camera {camera_index}")
                return False
    except Exception as e:
        print(f"Error initializing camera: {e}")
        camera_active = False
        return False

def read_qr_code(frame):
    """Read QR code from an image frame"""
    try:
        # Convert to grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Try to decode QR codes
        qr_codes = decode(gray)
        
        for qr_code in qr_codes:
            # Extract the data
            qr_data = qr_code.data.decode('utf-8')
            
            # Draw a rectangle around the QR code for visualization
            pts = qr_code.polygon
            if len(pts) > 4:
                hull = cv2.convexHull(np.array([pt for pt in pts], dtype=np.float32))
                cv2.polylines(frame, [hull], True, (0, 255, 0), 2)
            else:
                points = np.array(pts, dtype=np.int32)
                cv2.polylines(frame, [points], True, (0, 255, 0), 2)
                
            # Draw the data text
            cv2.putText(frame, qr_data, (qr_code.rect.left, qr_code.rect.top - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
            return qr_data
        
        return None
    except Exception as e:
        print(f"Error reading QR code: {e}")
        return None

def generate_frames():
    """Generate a stream of webcam frames with QR detection"""
    global camera, last_qr_code, last_qr_time, camera_active
    
    # If camera is not available, yield a placeholder image
    if camera is None or not camera.isOpened():
        # Create a placeholder image with text
        placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(placeholder, "Camera not available", (100, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        while True:
            # Encode the placeholder as JPEG and yield it
            _, buffer = cv2.imencode('.jpg', placeholder)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            time.sleep(1)  # Slow down the frame rate for the placeholder
    
    # Main camera loop
    while camera_active and camera.isOpened():
        try:
            success, frame = camera.read()
            if not success:
                print("Failed to read frame")
                time.sleep(0.1)
                continue
            
            # Check if frame is empty or invalid
            if frame is None or frame.size == 0:
                print("Empty frame received")
                time.sleep(0.1)
                continue
                
            # Try to detect QR code
            qr_data = read_qr_code(frame)
            
            # If we found a QR code, update the global variable
            if qr_data:
                with qr_lock:
                    last_qr_code = qr_data
                    last_qr_time = time.time()
                    print(f"Detected QR code: {qr_data}")
                
            # Add a simple overlay to show camera is active
            cv2.putText(frame, "Camera Active", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Encode the frame as JPEG
            _, buffer = cv2.imencode('.jpg', frame)
            frame_bytes = buffer.tobytes()
            
            # Yield the frame in the MJPEG format
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                   
        except Exception as e:
            print(f"Error in frame generation: {e}")
            time.sleep(0.5)
            
            # Create an error frame
            error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(error_frame, f"Camera error: {str(e)[:30]}...", (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            # Encode and yield the error frame
            _, buffer = cv2.imencode('.jpg', error_frame)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    """Root route for the API"""
    return jsonify({
        "status": "QR Scanner Service is running",
        "endpoints": {
            "/video_feed": "Stream camera feed with QR code detection",
            "/qr_result": "Get the last detected QR code",
            "/health": "Check service health",
            "/start_camera": "Start or switch camera (POST)",
            "/stop_camera": "Stop camera (POST)"
        }
    })

@app.route('/video_feed')
def video_feed():
    """Route for streaming video with QR detection"""
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

@app.route('/start_camera', methods=['POST'])
def start_camera():
    """Start or restart the camera"""
    data = request.json or {}
    camera_index = data.get('camera_index', 0)
    
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
    
    if camera is not None:
        try:
            camera_active = False
            camera.release()
            camera = None
            return jsonify({"message": "Camera stopped successfully"})
        except Exception as e:
            return jsonify({"error": f"Error stopping camera: {str(e)}"}), 500
    else:
        return jsonify({"message": "Camera was not active"})

@app.route('/switch_camera', methods=['POST'])
def switch_camera():
    """Switch to a different camera"""
    global camera, camera_active, current_camera_index
    
    try:
        # Release current camera if it exists
        if camera is not None:
            camera_active = False
            try:
                camera.release()
            except:
                pass
        
        # Simple approach: just increment the camera index
        # This assumes cameras have consecutive indices
        new_camera_index = (current_camera_index + 1) % 3  # Cycle through indices 0, 1, 2
        
        # Try to initialize the new camera
        success = initialize_camera(new_camera_index)
        
        if success:
            return jsonify({
                "camera_index": new_camera_index,
                "message": f"Switched to camera {new_camera_index}"
            })
        else:
            # If the new camera fails, try to go back to the original one
            fallback_success = initialize_camera(current_camera_index)
            if fallback_success:
                return jsonify({
                    "camera_index": current_camera_index,
                    "message": f"Failed to switch camera, reverted to camera {current_camera_index}"
                })
            else:
                return jsonify({"error": "Failed to initialize any camera"}), 500
    except Exception as e:
        print(f"Error switching camera: {e}")
        return jsonify({"error": f"Error switching camera: {str(e)}"}), 500

def parse_arguments():
    parser = argparse.ArgumentParser(description='QR Code Scanner Service')
    parser.add_argument('--port', type=int, default=5005, help='Port to run the server on')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to run the server on')
    parser.add_argument('--camera', type=int, default=0, help='Camera index to use')
    return parser.parse_args()

if __name__ == '__main__':
    args = parse_arguments()
    
    print(f"Starting QR Scanner Service on port {args.port}")
    print(f"Initializing camera {args.camera}")
    
    # Try to initialize the camera
    initialize_camera(args.camera)
    
    # Run the Flask app
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
