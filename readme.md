# Money Talks - Indonesian Rupiah Detector

A simple web application for detecting Indonesian Rupiah denominations using a trained machine learning model. This application uses a camera to capture images and predict the denomination of Rupiah banknotes.

## Features

- Camera access through the web browser
- Real-time banknote denomination detection
- Audio feedback for detected denominations
- Responsive design for mobile and desktop

## Prerequisites

- Node.js (v14 or later)
- NPM or Yarn
- Modern web browser (Chrome, Firefox, Edge, or Safari)
- Webcam or mobile device camera

## Project Structure

```
money-detector/
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   ├── camera.js
│   │   ├── model.js
│   │   └── router.js
│   ├── models/                                 # Add your model files here
│   │   ├── model.json                          # TensorFlow.js model JSON
│   │   └── final_model_mobilenetv2 (1).h5      # TensorFlow.js weights
│   │   └── group1-shard1of3.bin
│   │   └── group1-shard2of3.bin
│   │   └── group1-shard3of3.bin
│   └── index.html
├── package.json
├── server.js
└── README.md
```

## Setup Instructions

1. Clone this repository

   ```
   git clone https://github.com/your-username/money-detector.git
   cd money-detector
   ```

2. Install dependencies

   ```
   npm install
   ```

3. Add your TensorFlow.js model

   - Convert your `.h5` model to TensorFlow.js format:
     ```
     tensorflowjs_converter --input_format=keras path/to/model.h5 public/models/
     ```
   - Or place your already converted TensorFlow.js model files in the `public/models/` directory

4. Start the server

   ```
   npm start
   ```

5. Open your browser
   - Navigate to `http://localhost:3000`
   - Grant camera permissions when prompted

## Converting Your Model

To convert your H5 model to TensorFlow.js format:

1. Install TensorFlow.js converter

   ```
   pip install tensorflowjs
   ```

2. Convert your model

   ```
   tensorflowjs_converter --input_format=keras path/to/your/model.h5 public/models/
   ```

3. This will generate the necessary model.json and weights files in the models directory

## How to Use

1. Open the application in your browser
2. Click on "Mulai Deteksi" to start the camera
3. Point your camera at a Rupiah banknote
4. Click "Ambil Gambar" to capture and detect the denomination
5. The application will display and announce the detected denomination

## Supported Denominations

- Rp 1,000
- Rp 2,000
- Rp 5,000
- Rp 10,000
- Rp 20,000
- Rp 50,000
- Rp 100,000

## Troubleshooting

- **Camera not working**: Ensure you've granted camera permissions in your browser
- **Model not loading**: Check that model files are correctly placed in the `public/models/` directory
- **Prediction errors**: Try capturing in better lighting conditions and hold the banknote flat

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Based on the model trained by the Money Talks Machine Learning Team
