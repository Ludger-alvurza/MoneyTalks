// app.js - Main application logic with improved image processing

// DOM Elements
const videoElement = document.getElementById("video");
const captureButton = document.getElementById("captureButton");
const startButton = document.getElementById("cameraButton");
const resultElement = document.getElementById("resultText");
const canvasElement = document.getElementById("canvas");
const ctx = canvasElement.getContext("2d");
const capturedImageElement = document.getElementById("capturedImage");
const capturedImageContainer = document.getElementById(
  "capturedImageContainer"
);
const debugInfoElement = document.createElement("div");
debugInfoElement.className = "debug-info";
debugInfoElement.style.display = "none";

// App State
let isModelLoaded = false;
let isCameraStarted = false;
let isDebugMode = false; // Set to true for debugging model behavior

// Audio feedback setup with improved error handling
const setupAudio = () => {
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    return audioContext;
  } catch (error) {
    console.warn("Audio Context could not be created:", error);
    return null;
  }
};

const audioContext = setupAudio();

const speakResult = (text) => {
  if ("speechSynthesis" in window) {
    try {
      // Cancel any ongoing speech
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(
        `Terdeteksi uang ${text} rupiah`
      );
      utterance.lang = "id-ID";
      utterance.rate = 0.9; // Slightly slower for better clarity
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Speech synthesis error:", error);
    }
  }
};

// Initialize application
async function initApp() {
  showStatus("TensorFlow.js berhasil dimuat. Memeriksa model...");

  // Add debug button to container if debug mode is enabled
  if (isDebugMode) {
    const debugButton = document.createElement("button");
    debugButton.textContent = "Toggle Debug Info";
    debugButton.className = "debug-toggle-btn";
    debugButton.addEventListener("click", () => {
      debugInfoElement.style.display =
        debugInfoElement.style.display === "none" ? "block" : "none";
    });

    document.querySelector(".container").appendChild(debugButton);
    document.querySelector(".container").appendChild(debugInfoElement);
  }

  try {
    // Verify if model files exist by checking the main JSON file
    const modelResponse = await fetch("./models/model.json", {
      method: "HEAD",
    }).catch(() => {
      // Try alternative path if primary fails
      return fetch("./models_converted/model.json", {
        method: "HEAD",
      });
    });

    if (modelResponse.ok) {
      showStatus("File model ditemukan. Memuat model...");

      // Wait for TensorFlow.js to be fully loaded
      if (typeof tf === "undefined") {
        showStatus("Menunggu TensorFlow.js dimuat...");
        await new Promise((resolve) => {
          const checkTF = setInterval(() => {
            if (typeof tf !== "undefined") {
              clearInterval(checkTF);
              resolve();
            }
          }, 100);
        });
      }

      // Load the model with improved error handling
      try {
        await window.modelHandler.init();
        isModelLoaded = true;
        showStatus("Model berhasil dimuat! Siap untuk deteksi.");
        enableInterface();
      } catch (modelError) {
        console.error("Model loading error:", modelError);
        showStatus(`ERROR: Gagal memuat model. ${modelError.message}`, true);
      }
    } else {
      showStatus(
        "ERROR: File model tidak ditemukan. Pastikan file ada di folder /models atau /models_converted.",
        true
      );
    }
  } catch (error) {
    console.error("Application initialization error:", error);
    showStatus(
      `ERROR: Gagal menginisialisasi aplikasi. ${error.message}`,
      true
    );
  }
}

// Start camera with improved error handling and settings
async function startCamera() {
  try {
    // Try different camera constraints progressively
    const constraints = [
      // First try: HD back camera
      {
        video: {
          facingMode: { exact: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      // Second try: Any back camera
      {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      // Third try: Any camera with HD
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      // Last resort: Any camera
      { video: true },
    ];

    let stream = null;
    let errorMsg = "";

    // Try each constraint until one works
    for (let i = 0; i < constraints.length; i++) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
        console.log(`Camera started with constraint set ${i + 1}`);
        break; // Exit loop if successful
      } catch (e) {
        errorMsg = e.message;
        console.warn(`Failed with constraint set ${i + 1}:`, e);
        // Continue to next constraint set
      }
    }

    if (!stream) {
      throw new Error(`No camera available. ${errorMsg}`);
    }

    videoElement.srcObject = stream;

    // Wait for video to be ready
    await new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });

    // Set canvas dimensions to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    isCameraStarted = true;
    showStatus(
      'Kamera aktif. Arahkan ke uang kertas dan tekan "Ambil Gambar".'
    );
    captureButton.disabled = false;
    startButton.textContent = "Matikan Kamera";
  } catch (error) {
    console.error("Camera error:", error);
    showStatus(`ERROR: Tidak dapat mengakses kamera. ${error.message}`, true);
  }
}

// Stop camera with resource cleanup
function stopCamera() {
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => {
      track.stop();
    });
    videoElement.srcObject = null;
    isCameraStarted = false;
    showStatus("Kamera dimatikan.");
    captureButton.disabled = true;
    startButton.textContent = "Mulai Kamera";
  }
}

// Toggle camera
function toggleCamera() {
  if (isCameraStarted) {
    stopCamera();
  } else {
    startCamera();
  }
}

// Enhanced image processing before prediction
function preprocessImage(sourceCanvas) {
  // Create a new canvas for processing
  const processedCanvas = document.createElement("canvas");
  processedCanvas.width = 224;
  processedCanvas.height = 224;
  const processedCtx = processedCanvas.getContext("2d");

  // Get dimensions of source
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // Create square crop from center
  const size = Math.min(width, height);
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;

  // Draw center crop
  processedCtx.drawImage(
    sourceCanvas,
    offsetX,
    offsetY,
    size,
    size,
    0,
    0,
    224,
    224
  );

  // Apply slight contrast enhancement
  processedCtx.filter = "contrast(115%) brightness(105%)";
  processedCtx.drawImage(processedCanvas, 0, 0);
  processedCtx.filter = "none";

  if (isDebugMode) {
    // Show processing stages in debug mode
    debugInfoElement.innerHTML = "";

    // Original image thumbnail
    const origThumb = document.createElement("canvas");
    origThumb.width = 100;
    origThumb.height = 100 * (sourceCanvas.height / sourceCanvas.width);
    const origCtx = origThumb.getContext("2d");
    origCtx.drawImage(sourceCanvas, 0, 0, origThumb.width, origThumb.height);

    // Processed image thumbnail
    const procThumb = document.createElement("canvas");
    procThumb.width = 100;
    procThumb.height = 100;
    const procCtx = procThumb.getContext("2d");
    procCtx.drawImage(processedCanvas, 0, 0, procThumb.width, procThumb.height);

    debugInfoElement.innerHTML = "<p>Original:</p>";
    debugInfoElement.appendChild(origThumb);
    debugInfoElement.innerHTML += "<p>Processed:</p>";
    debugInfoElement.appendChild(procThumb);
  }

  return processedCanvas;
}

// Capture image and run prediction with improved processing
async function captureAndPredict() {
  if (!isCameraStarted || !isModelLoaded) {
    showStatus("Kamera atau model belum siap.", true);
    return;
  }

  try {
    // Draw current video frame to canvas
    ctx.drawImage(
      videoElement,
      0,
      0,
      canvasElement.width,
      canvasElement.height
    );

    // Display the captured image
    capturedImageElement.src = canvasElement.toDataURL("image/png");
    capturedImageContainer.style.display = "block";

    // Show processing status
    showStatus("Memproses gambar...");

    // Small delay to allow status update to render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Preprocess image for better recognition
    const processedCanvas = preprocessImage(canvasElement);

    // Run prediction with enhanced model
    const result = await window.modelHandler.predict(processedCanvas);

    // Format and display result
    const denomination = result.className;
    const confidence = (result.probability * 100).toFixed(2);
    const resultText = `Terdeteksi: Rp ${denomination} (${confidence}% yakin)`;

    resultElement.textContent = resultText;
    showStatus("Deteksi selesai!");

    // Display additional debug info if enabled
    if (isDebugMode && result.allProbabilities) {
      let debugHTML = "<h4>All Probabilities:</h4><ul>";
      result.allProbabilities
        .sort((a, b) => b.probability - a.probability)
        .forEach((item) => {
          debugHTML += `<li>Rp ${item.name}: ${(item.probability * 100).toFixed(
            2
          )}%</li>`;
        });
      debugHTML += "</ul>";
      debugInfoElement.innerHTML += debugHTML;
      debugInfoElement.style.display = "block";
    }

    // Provide audio feedback
    speakResult(denomination);
  } catch (error) {
    console.error("Prediction error:", error);
    showStatus(`ERROR: Gagal memproses gambar. ${error.message}`, true);
    resultElement.textContent = "Deteksi gagal";
  }
}

// Handle image upload with improved processing
function setupImageUpload() {
  const fileInput = document.getElementById("imageUpload");
  if (fileInput) {
    fileInput.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();

        reader.onload = async function (event) {
          // Create an image element to load the uploaded file
          const img = new Image();
          img.onload = async function () {
            // Set canvas size to match the image
            canvasElement.width = img.width;
            canvasElement.height = img.height;

            // Draw the image on canvas
            ctx.drawImage(img, 0, 0, img.width, img.height);

            // Display the captured image
            capturedImageElement.src = canvasElement.toDataURL("image/png");
            capturedImageContainer.style.display = "block";

            // Process the image if model is loaded
            if (isModelLoaded) {
              showStatus("Memproses gambar...");

              try {
                // Preprocess image for better recognition
                const processedCanvas = preprocessImage(canvasElement);

                // Run prediction with enhanced model
                const result = await window.modelHandler.predict(
                  processedCanvas
                );

                // Format and display result
                const denomination = result.className;
                const confidence = (result.probability * 100).toFixed(2);
                const resultText = `Terdeteksi: Rp ${denomination} (${confidence}% yakin)`;

                resultElement.textContent = resultText;
                showStatus("Deteksi selesai!");

                // Display additional debug info if enabled
                if (isDebugMode && result.allProbabilities) {
                  let debugHTML = "<h4>All Probabilities:</h4><ul>";
                  result.allProbabilities
                    .sort((a, b) => b.probability - a.probability)
                    .forEach((item) => {
                      debugHTML += `<li>Rp ${item.name}: ${(
                        item.probability * 100
                      ).toFixed(2)}%</li>`;
                    });
                  debugHTML += "</ul>";
                  debugInfoElement.innerHTML += debugHTML;
                  debugInfoElement.style.display = "block";
                }

                // Provide audio feedback
                speakResult(denomination);
              } catch (error) {
                console.error("Prediction error:", error);
                showStatus(
                  `ERROR: Gagal memproses gambar. ${error.message}`,
                  true
                );
                resultElement.textContent = "Deteksi gagal";
              }
            } else {
              showStatus("Model belum dimuat. Tunggu sebentar...", true);
            }
          };

          // Set the image source to the uploaded file
          img.src = event.target.result;
        };

        // Read the uploaded file
        reader.readAsDataURL(e.target.files[0]);
      }
    });
  }
}

// Show status message with improved styling
function showStatus(message, isError = false) {
  // Create a status message element if it doesn't exist
  let statusElement = document.querySelector(".status-message");
  if (!statusElement) {
    statusElement = document.createElement("div");
    statusElement.className = "status-message";
    document
      .querySelector(".container")
      .insertBefore(statusElement, document.querySelector(".camera-container"));
  }

  statusElement.textContent = message;
  statusElement.className = isError ? "status-message error" : "status-message";
  console.log(isError ? "ERROR: " : "STATUS: ", message);

  // Make sure the element is visible
  statusElement.style.display = "block";
  statusElement.style.opacity = "1";

  // Auto-hide the message after 5 seconds if it's not an error
  if (!isError) {
    setTimeout(() => {
      statusElement.style.opacity = "0";
      setTimeout(() => {
        statusElement.style.display = "none";
        statusElement.style.opacity = "1";
      }, 1000);
    }, 5000);
  }
}

// Enable UI elements once model is loaded
function enableInterface() {
  startButton.disabled = false;
  startButton.addEventListener("click", toggleCamera);
  captureButton.addEventListener("click", captureAndPredict);
  setupImageUpload();

  // Add key bindings for faster operation
  document.addEventListener("keydown", (e) => {
    // Space bar for capture
    if (e.code === "Space" && !captureButton.disabled) {
      captureAndPredict();
      e.preventDefault();
    }
    // C key for toggling camera
    if (e.code === "KeyC" && !startButton.disabled) {
      toggleCamera();
      e.preventDefault();
    }
    // D key for toggling debug mode
    if (e.code === "KeyD" && isDebugMode) {
      debugInfoElement.style.display =
        debugInfoElement.style.display === "none" ? "block" : "none";
      e.preventDefault();
    }
  });
}

// Cleanup resources when page unloads
window.addEventListener("beforeunload", () => {
  // Stop camera if active
  if (isCameraStarted) {
    stopCamera();
  }

  // Dispose model resources
  if (window.modelHandler && window.modelHandler.dispose) {
    window.modelHandler.dispose();
  }
});

// Initialize on page load
document.addEventListener("DOMContentLoaded", initApp);
