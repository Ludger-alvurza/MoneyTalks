// model.js - Handles loading and inference with the TensorFlow.js model
// Updated to process images by resizing to 224x224 without rescaling pixel values

const MODEL_PATH = "./models_new_3/model.json";
const CLASS_NAMES = [
  "1.000",
  "10.000",
  "100.000",
  "2.000",
  "20.000",
  "5.000",
  "50.000",
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
 * Just resizes to 224x224 without any pixel value rescaling
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

    // Simply resize the entire image to 224x224 without cropping
    ctx.drawImage(image, 0, 0, inputWidth, inputHeight, 0, 0, 224, 224);

    // Process the image with TensorFlow.js
    const predictionTensor = tf.tidy(() => {
      // Convert canvas to tensor
      let tensor = tf.browser.fromPixels(tempCanvas);

      // Add batch dimension and convert to float32 (required by the model)
      tensor = tensor.expandDims(0).toFloat();

      // Note: We're converting to float32 but not rescaling values
      // This keeps original pixel values (0-255) but in float32 format

      // Make prediction
      if (model.predict) {
        // For LayersModel
        return model.predict(tensor);
      } else {
        // For GraphModel
        return model.execute(tensor);
      }
    });

    // Get data from prediction tensor outside of tidy
    const probabilities = await predictionTensor.data();

    // Process results and clean up
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
 * Updated to use direct resizing without pixel value rescaling
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

      // Apply different augmentations without center cropping
      if (i === 0) {
        // First prediction: just resize the entire image without cropping
        ctx.drawImage(image, 0, 0, inputWidth, inputHeight, 0, 0, 224, 224);
      } else if (i === 1) {
        // Random translation (RandomTranslation(0.1, 0.1))
        const jitterX = (Math.random() * 0.2 - 0.1) * inputWidth;
        const jitterY = (Math.random() * 0.2 - 0.1) * inputHeight;
        ctx.drawImage(
          image,
          -jitterX,
          -jitterY,
          inputWidth,
          inputHeight,
          0,
          0,
          224,
          224
        );
      } else if (i === 2) {
        // Random zoom (RandomZoom(0.2))
        const zoom = 0.8 + Math.random() * 0.4; // Zoom between 0.8x and 1.2x
        const newWidth = inputWidth * zoom;
        const newHeight = inputHeight * zoom;
        const offsetX = (inputWidth - newWidth) / 2;
        const offsetY = (inputHeight - newHeight) / 2;
        ctx.drawImage(
          image,
          offsetX,
          offsetY,
          newWidth,
          newHeight,
          0,
          0,
          224,
          224
        );
      } else if (i === 3) {
        // Horizontal flip
        ctx.translate(tempCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0, inputWidth, inputHeight, 0, 0, 224, 224);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      } else if (i === 4) {
        // Vertical flip
        ctx.translate(0, tempCanvas.height);
        ctx.scale(1, -1);
        ctx.drawImage(image, 0, 0, inputWidth, inputHeight, 0, 0, 224, 224);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      }

      // Process tensor and get prediction
      const predictionTensor = tf.tidy(() => {
        // Convert to tensor
        let tensor = tf.browser.fromPixels(tempCanvas);

        // Add batch dimension and convert to float32 (required by the model)
        tensor = tensor.expandDims(0).toFloat();

        // Note: We're converting to float32 but not rescaling values
        // This keeps original pixel values (0-255) but in float32 format

        // Make prediction
        if (model.predict) {
          return model.predict(tensor);
        } else {
          return model.execute(tensor);
        }
      });

      // Get data from prediction tensor
      const probabilities = await predictionTensor.data();

      // Process results and clean up
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
  predictWithEnsemble,
  dispose,
};
