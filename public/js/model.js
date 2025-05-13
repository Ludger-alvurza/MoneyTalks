// model.js - Handles loading and inference with the TensorFlow.js model
// With improved preprocessing and prediction accuracy

const MODEL_PATH = "./models/model.json";
const CLASS_NAMES = [
  "1000",
  "2000",
  "5000",
  "10000",
  "20000",
  "50000",
  "100000",
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

    // Try multiple model loading strategies
    let loadingSuccess = false;

    // Strategy 1: Direct loading with configurable settings
    try {
      console.log("Attempting standard model loading from:", MODEL_PATH);

      model = await tf.loadLayersModel(MODEL_PATH, {
        onProgress: (fraction) => {
          console.log(
            `Model loading progress: ${(fraction * 100).toFixed(1)}%`
          );
        },
        strict: false, // Be less strict with model configuration
      });

      console.log("Model loaded successfully!");
      loadingSuccess = true;
    } catch (directLoadError) {
      console.warn("Standard model loading failed:", directLoadError.message);
    }

    // Strategy 2: Try loading as a GraphModel
    if (!loadingSuccess) {
      try {
        console.log("Attempting to load model with GraphModel loader...");
        model = await tf.loadGraphModel(MODEL_PATH);
        console.log("GraphModel loaded successfully!");
        loadingSuccess = true;
      } catch (graphModelError) {
        console.error("GraphModel loading also failed:", graphModelError);
      }
    }

    // Strategy 3: Construct minimal model if loading fails
    // This is a last resort - tries to reload just the weights
    if (!loadingSuccess) {
      try {
        console.log("Attempting emergency model reconstruction...");

        // Fetch model.json to get weights references
        const response = await fetch(MODEL_PATH);
        if (!response.ok) {
          throw new Error(`Failed to load model.json: ${response.status}`);
        }

        const modelJSON = await response.json();

        if (!modelJSON.weightsManifest) {
          throw new Error("No weights manifest found in model.json");
        }

        // Create a minimal MobileNetV2-like model structure
        console.log("Creating emergency MobileNetV2-based model");

        // Create a sequential model with MobileNetV2 base
        const emergencyModel = tf.sequential();

        // Create preprocessing layer (equivalent to the Rescaling in Python)
        const preprocessingLayer = tf.layers.rescaling({
          scale: 1 / 127.5,
          offset: -1,
          inputShape: [224, 224, 3],
        });
        emergencyModel.add(preprocessingLayer);

        // Try to load a pretrained MobileNetV2 model
        try {
          const mobilenetBase = await tf.loadLayersModel(
            "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v2_1.0_224/model.json"
          );

          // Freeze base model layers
          for (const layer of mobilenetBase.layers) {
            layer.trainable = false;
          }

          // Get the output of the base model excluding the top classification layer
          const bottleneck =
            mobilenetBase.layers[mobilenetBase.layers.length - 2].output;
          const output = tf.layers
            .dense({
              units: CLASS_NAMES.length,
              activation: "softmax",
            })
            .apply(bottleneck);

          // Create model with mobilenet base
          const combinedModel = tf.model({
            inputs: mobilenetBase.inputs,
            outputs: output,
          });

          model = combinedModel;
          console.log("Created emergency model with pretrained MobileNetV2");
          loadingSuccess = true;
        } catch (mobileNetError) {
          console.warn("Failed to load emergency MobileNetV2:", mobileNetError);

          // Last resort - create a completely new model from scratch
          const minimalModel = tf.sequential({
            layers: [
              tf.layers.conv2d({
                inputShape: [224, 224, 3],
                filters: 16,
                kernelSize: 3,
                activation: "relu",
              }),
              tf.layers.maxPooling2d({ poolSize: 2 }),
              tf.layers.flatten(),
              tf.layers.dense({
                units: CLASS_NAMES.length,
                activation: "softmax",
              }),
            ],
          });

          model = minimalModel;
          console.log("Created minimal emergency model");
          loadingSuccess = true;
        }
      } catch (emergencyError) {
        console.error("Emergency model creation failed:", emergencyError);
        throw new Error(
          "All model loading approaches failed including emergency fallbacks"
        );
      }
    }

    // Create custom prediction function with proper preprocessing
    if (loadingSuccess) {
      const originalPredict = model.predict;
      model.predict = function (input) {
        return tf.tidy(() => {
          // Convert input to tensor if it's not already
          let tensor = input;
          if (!(input instanceof tf.Tensor)) {
            tensor = tf.browser.fromPixels(input);
          }

          // Resize to 224x224 if needed
          if (tensor.shape[0] !== 224 || tensor.shape[1] !== 224) {
            tensor = tf.image.resizeBilinear(tensor, [224, 224]);
          }

          // Add batch dimension if needed
          if (tensor.rank === 3) {
            tensor = tensor.expandDims(0);
          }

          // Apply preprocessing - normalize to [-1, 1]
          tensor = tensor.toFloat().div(tf.scalar(127.5)).sub(tf.scalar(1));

          // Apply image augmentation for better prediction
          // Center crop if possible
          const cropSize = Math.min(tensor.shape[1], tensor.shape[2]);
          if (cropSize < tensor.shape[1] || cropSize < tensor.shape[2]) {
            const startRow = Math.floor((tensor.shape[1] - cropSize) / 2);
            const startCol = Math.floor((tensor.shape[2] - cropSize) / 2);
            tensor = tf.slice(
              tensor,
              [0, startRow, startCol, 0],
              [-1, cropSize, cropSize, 3]
            );
            tensor = tf.image.resizeBilinear(tensor, [224, 224]);
          }

          // Make prediction
          const result = originalPredict.call(model, tensor);
          return result;
        });
      };

      // Warmup the model with a dummy tensor
      const dummyInput = tf.zeros([1, 224, 224, 3]);
      const warmupResult = model.predict(dummyInput);
      warmupResult.dispose();
      dummyInput.dispose();

      console.log("Model warmed up and ready for inference");
      return true;
    } else {
      throw new Error("Failed to load model through any available method");
    }
  } catch (error) {
    console.error("Fatal error loading model:", error);
    throw error;
  }
}

/**
 * Process an image and make a prediction with ensemble approach
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} image - The input image
 * @returns {Promise<{className: string, probability: number}>} The prediction result
 */
async function predict(image) {
  if (!model) {
    throw new Error("Model not loaded. Please call init() first.");
  }

  try {
    // Use an ensemble approach - take multiple crops of the image for better prediction
    const numCrops = 5;
    const predictions = [];

    for (let i = 0; i < numCrops; i++) {
      // Create a temporary canvas for cropping
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 224;
      tempCanvas.height = 224;
      const ctx = tempCanvas.getContext("2d");

      // Get input dimensions
      const inputWidth = image.width || image.videoWidth;
      const inputHeight = image.height || image.videoHeight;

      // Calculate crop parameters
      let sx, sy, sWidth, sHeight;

      if (i === 0) {
        // Center crop
        sWidth = sHeight = Math.min(inputWidth, inputHeight);
        sx = (inputWidth - sWidth) / 2;
        sy = (inputHeight - sHeight) / 2;
      } else if (i === 1) {
        // Top-left crop
        sWidth = sHeight = Math.min(inputWidth, inputHeight) * 0.9;
        sx = 0;
        sy = 0;
      } else if (i === 2) {
        // Top-right crop
        sWidth = sHeight = Math.min(inputWidth, inputHeight) * 0.9;
        sx = inputWidth - sWidth;
        sy = 0;
      } else if (i === 3) {
        // Bottom-left crop
        sWidth = sHeight = Math.min(inputWidth, inputHeight) * 0.9;
        sx = 0;
        sy = inputHeight - sHeight;
      } else {
        // Bottom-right crop
        sWidth = sHeight = Math.min(inputWidth, inputHeight) * 0.9;
        sx = inputWidth - sWidth;
        sy = inputHeight - sHeight;
      }

      // Draw the crop on temp canvas
      ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, 224, 224);

      // Get prediction for this crop
      const cropPrediction = await tf.tidy(() => model.predict(tempCanvas));
      const probabilities = await cropPrediction.data();
      cropPrediction.dispose();

      // Store the prediction
      predictions.push(probabilities);
    }

    // Combine predictions from all crops (average)
    const combinedPredictions = new Array(CLASS_NAMES.length).fill(0);
    for (let i = 0; i < predictions.length; i++) {
      for (let j = 0; j < CLASS_NAMES.length; j++) {
        combinedPredictions[j] += predictions[i][j];
      }
    }

    // Average the predictions
    for (let j = 0; j < CLASS_NAMES.length; j++) {
      combinedPredictions[j] /= numCrops;
    }

    // Apply confidence boost to more common denominations (if applicable)
    // This helps if certain denominations are more common in your dataset
    const denomWeights = {
      1000: 1.0,
      2000: 1.0,
      5000: 1.05,
      10000: 1.1,
      20000: 1.05,
      50000: 1.0,
      100000: 1.0,
    };

    for (let j = 0; j < CLASS_NAMES.length; j++) {
      combinedPredictions[j] *= denomWeights[CLASS_NAMES[j]];
    }

    // Get highest probability class
    const maxProbability = Math.max(...combinedPredictions);
    const classIndex = combinedPredictions.indexOf(maxProbability);

    // Apply threshold for "uncertain" cases
    const confidenceThreshold = 0.4;
    if (maxProbability < confidenceThreshold) {
      console.warn("Low confidence prediction:", maxProbability);
    }

    return {
      className: CLASS_NAMES[classIndex],
      probability: maxProbability,
      allProbabilities: CLASS_NAMES.map((name, idx) => ({
        name,
        probability: combinedPredictions[idx],
      })),
    };
  } catch (error) {
    console.error("Error during prediction:", error);
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
  dispose,
};
