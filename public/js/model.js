// model.js - Handles loading and inference with the TensorFlow.js model
// Updated to exactly match the Python MobileNetV2 model architecture and preprocessing

const MODEL_PATH = "./models_new/model.json"; // Updated to your new model path
const CLASS_NAMES = [
  "1000",
  "10000",
  "100000",
  "2000",
  "20000",
  "5000",
  "50000",
];

let model = null;

/**
 * Initialize and load the TensorFlow.js model
 */
async function init() {
  console.log("Starting model loading...");

  try {
    // Make sure TensorFlow.js is properly loaded
    if (!tf) {
      throw new Error("TensorFlow.js is not loaded");
    }

    // Strategy 1: Try loading as a GraphModel first (SavedModel format)
    try {
      console.log("Attempting to load model from:", MODEL_PATH);
      model = await tf.loadGraphModel(MODEL_PATH);
      console.log("GraphModel loaded successfully!");
      return true;
    } catch (graphModelError) {
      console.warn("GraphModel loading failed:", graphModelError.message);

      // Fallback: Try as LayersModel
      try {
        console.log("Attempting to load as LayersModel...");
        model = await tf.loadLayersModel(MODEL_PATH);
        console.log("LayersModel loaded successfully!");
        return true;
      } catch (layersModelError) {
        console.error("LayersModel loading failed:", layersModelError.message);
        throw new Error(
          "Failed to load model with both GraphModel and LayersModel loaders"
        );
      }
    }
  } catch (error) {
    console.error("Fatal error loading model:", error);
    throw error;
  }
}

/**
 * Process an image and make a prediction
 * Updated to exactly match Python preprocessing and fix Promise-in-tidy issue
 *
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} image - The input image
 * @returns {Promise<{className: string, probability: number}>} The prediction result
 */
async function predict(image) {
  if (!model) {
    throw new Error("Model not loaded. Please call init() first.");
  }

  try {
    // Create a temporary canvas for processing
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = 224;
    tempCanvas.height = 224;
    const ctx = tempCanvas.getContext("2d");

    // Get input dimensions
    const inputWidth = image.width || image.videoWidth || 224;
    const inputHeight = image.height || image.videoHeight || 224;

    // Calculate source dimensions to maintain aspect ratio (center crop)
    let sx = 0,
      sy = 0;
    let sWidth = inputWidth,
      sHeight = inputHeight;

    // Ensure square crop (center crop like in Python)
    if (inputWidth > inputHeight) {
      sx = (inputWidth - inputHeight) / 2;
      sWidth = inputHeight;
    } else if (inputHeight > inputWidth) {
      sy = (inputHeight - inputWidth) / 2;
      sHeight = inputWidth;
    }

    // Draw the image with center crop
    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);

    // Process the image with TensorFlow.js
    // ⚠️ FIX: Split the tidy() and Promise operations to avoid the error

    // Step 1: Process input tensor and get prediction tensor using tidy
    const predictionTensor = tf.tidy(() => {
      // Convert canvas to tensor
      let tensor = tf.browser.fromPixels(tempCanvas);

      // Add batch dimension
      tensor = tensor.expandDims(0);

      // Preprocess exactly like in Python:
      // layers.Rescaling(scale=1./127.5, offset=-1)
      tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));

      // Make prediction
      if (model.predict) {
        // For LayersModel
        return model.predict(tensor);
      } else {
        // For GraphModel
        return model.execute(tensor);
      }
    });

    // Step 2: Get data from prediction tensor outside of tidy
    const probabilities = await predictionTensor.data();

    // Step 3: Process results and clean up
    const probs = Array.from(probabilities);

    // Get highest probability class
    const maxProbability = Math.max(...probs);
    const classIndex = probs.indexOf(maxProbability);

    // Clean up tensors
    predictionTensor.dispose();

    // Return prediction result
    return {
      className: CLASS_NAMES[classIndex],
      probability: maxProbability,
      allProbabilities: CLASS_NAMES.map((name, idx) => ({
        name,
        probability: probs[idx],
      })),
    };
  } catch (error) {
    console.error("Error during prediction:", error);
    throw error;
  }
}

/**
 * Run multiple predictions with different augmentations (test-time augmentation)
 * Similar to the approach in your Python training code
 *
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} image - The input image
 * @returns {Promise<{className: string, probability: number}>} The ensemble prediction result
 */
async function predictWithEnsemble(image) {
  if (!model) {
    throw new Error("Model not loaded. Please call init() first.");
  }

  try {
    // Use ensemble approach (test-time augmentation like in Python)
    const numPredictions = 5;
    const allPredictions = [];

    for (let i = 0; i < numPredictions; i++) {
      // Create a temporary canvas for processing
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 224;
      tempCanvas.height = 224;
      const ctx = tempCanvas.getContext("2d");

      // Get input dimensions
      const inputWidth = image.width || image.videoWidth || 224;
      const inputHeight = image.height || image.videoHeight || 224;

      // Calculate source dimensions (center crop)
      let sx = 0,
        sy = 0;
      let sWidth = inputWidth,
        sHeight = inputHeight;

      if (inputWidth > inputHeight) {
        sx = (inputWidth - inputHeight) / 2;
        sWidth = inputHeight;
      } else if (inputHeight > inputWidth) {
        sy = (inputHeight - inputWidth) / 2;
        sHeight = inputWidth;
      }

      // Apply different augmentations for each prediction
      // This simulates your Python augmentations
      if (i > 0) {
        // Add random translation (RandomTranslation(0.1, 0.1))
        const jitterX = (Math.random() * 0.2 - 0.1) * sWidth;
        const jitterY = (Math.random() * 0.2 - 0.1) * sHeight;
        sx += jitterX;
        sy += jitterY;

        // Add zoom variation (RandomZoom(0.2))
        if (i === 2) {
          const zoom = 0.8 + Math.random() * 0.4; // Zoom between 0.8x and 1.2x
          const newWidth = sWidth * zoom;
          const newHeight = sHeight * zoom;
          sx += (sWidth - newWidth) / 2;
          sy += (sHeight - newHeight) / 2;
          sWidth = newWidth;
          sHeight = newHeight;
        }

        // Add flip variation (RandomFlip)
        if (i === 3) {
          // Horizontal flip
          ctx.translate(tempCanvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);
        } else if (i === 4) {
          // Vertical flip
          ctx.translate(0, tempCanvas.height);
          ctx.scale(1, -1);
          ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);
        } else {
          // Standard drawing
          ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);
        }

        // Reset transform if needed
        if (i === 3 || i === 4) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      } else {
        // Default center crop for first prediction
        ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);
      }

      // ⚠️ FIX: Similar fix applied to the ensemble prediction method

      // Step 1: Process tensor and get prediction using tidy
      const predictionTensor = tf.tidy(() => {
        // Convert to tensor
        let tensor = tf.browser.fromPixels(tempCanvas);

        // Add batch dimension
        tensor = tensor.expandDims(0);

        // Apply exact same preprocessing as Python:
        // layers.Rescaling(scale=1./127.5, offset=-1)
        tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));

        // Make prediction
        if (model.predict) {
          return model.predict(tensor);
        } else {
          return model.execute(tensor);
        }
      });

      // Step 2: Get data from prediction tensor outside of tidy
      const probabilities = await predictionTensor.data();

      // Step 3: Process results and clean up
      const probs = Array.from(probabilities);
      predictionTensor.dispose();

      // Store prediction
      allPredictions.push(probs);
    }

    // Average all predictions (ensemble)
    const combinedPredictions = new Array(CLASS_NAMES.length).fill(0);
    for (const pred of allPredictions) {
      for (let j = 0; j < CLASS_NAMES.length; j++) {
        combinedPredictions[j] += pred[j];
      }
    }

    // Average the predictions
    for (let j = 0; j < CLASS_NAMES.length; j++) {
      combinedPredictions[j] /= numPredictions;
    }

    // Get highest probability class
    const maxProbability = Math.max(...combinedPredictions);
    const classIndex = combinedPredictions.indexOf(maxProbability);

    return {
      className: CLASS_NAMES[classIndex],
      probability: maxProbability,
      allProbabilities: CLASS_NAMES.map((name, idx) => ({
        name,
        probability: combinedPredictions[idx],
      })),
    };
  } catch (error) {
    console.error("Error during ensemble prediction:", error);
    throw error;
  }
}

/**
 * Clean up resources
 */
function dispose() {
  if (model) {
    model.dispose();
    model = null;
  }
  // Clean up any orphaned tensors
  tf.disposeVariables();
  tf.engine().purge();
}

// Export the functions
window.modelHandler = {
  init,
  predict,
  predictWithEnsemble, // Added ensemble prediction method
  dispose,
};
