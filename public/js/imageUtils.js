// Additional utility functions for image preprocessing and model optimization

// imageUtils.js - Enhanced image processing utilities for currency detection

const ImageUtils = {
  // Apply adaptive preprocessing based on image analysis
  enhanceImage: function (canvas) {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate image statistics
    let totalBrightness = 0;
    let totalContrast = 0;
    let min = 255;
    let max = 0;

    // Sample pixels (for performance, don't process every pixel)
    const sampleStep = 5; // Check every 5th pixel
    let sampledPixels = 0;

    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Simple grayscale conversion to calculate brightness
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      totalBrightness += brightness;

      // Track min/max for contrast calculation
      if (brightness < min) min = brightness;
      if (brightness > max) max = brightness;

      sampledPixels++;
    }

    // Calculate average brightness and contrast
    const avgBrightness = totalBrightness / sampledPixels;
    const contrast = max - min;

    console.log(
      `Image analysis - Brightness: ${avgBrightness.toFixed(
        2
      )}, Contrast: ${contrast.toFixed(2)}`
    );

    // Apply appropriate filters based on image analysis
    try {
      // Reset any existing filters
      ctx.filter = "none";

      // Low brightness image - boost brightness
      if (avgBrightness < 100) {
        ctx.filter = `brightness(${Math.min(130, 130 - avgBrightness / 2)}%)`;
        ctx.drawImage(canvas, 0, 0);
      }

      // Low contrast image - boost contrast
      if (contrast < 100) {
        ctx.filter = `contrast(${Math.min(150, 150 - contrast / 2)}%)`;
        ctx.drawImage(canvas, 0, 0);
      }

      // Reset filters
      ctx.filter = "none";

      // For very dark images, try using curves-like adjustment
      if (avgBrightness < 80) {
        const newImageData = ctx.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );
        const newData = newImageData.data;

        // Apply curve adjustment to each channel
        for (let i = 0; i < newData.length; i += 4) {
          // Apply curves-like function to each channel
          newData[i] = this.applyCurve(newData[i], avgBrightness); // R
          newData[i + 1] = this.applyCurve(newData[i + 1], avgBrightness); // G
          newData[i + 2] = this.applyCurve(newData[i + 2], avgBrightness); // B
        }

        ctx.putImageData(newImageData, 0, 0);
      }

      return canvas;
    } catch (e) {
      console.warn("Image enhancement failed, using original image:", e);
      return canvas; // Return original canvas if enhancements fail
    }
  },

  // Custom curve adjustment function
  applyCurve: function (value, avgBrightness) {
    // Dynamically adjust curve based on image brightness
    const midpoint = Math.max(20, Math.min(50, 70 - avgBrightness / 3));
    const factor = 128 / midpoint;

    if (value < midpoint) {
      // Boost shadows more significantly
      return Math.min(255, Math.floor(value * factor));
    } else {
      // More gentle adjustment to highlights
      const adjustment =
        ((value - midpoint) * (255 - midpoint * factor)) / (255 - midpoint);
      return Math.min(255, Math.floor(midpoint * factor + adjustment));
    }
  },

  // Create optimized crops for model input
  createOptimizedCrops: function (canvas) {
    const crops = [];
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // Create a temporary canvas for crops
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 224;
    cropCanvas.height = 224;
    const cropCtx = cropCanvas.getContext("2d");

    // Helper function to create a crop
    const createCrop = (sx, sy, sWidth, sHeight) => {
      // Clear the canvas
      cropCtx.clearRect(0, 0, 224, 224);

      // Draw the cropped region
      cropCtx.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, 224, 224);

      // Create a copy of the canvas
      const cropResult = document.createElement("canvas");
      cropResult.width = 224;
      cropResult.height = 224;
      const resultCtx = cropResult.getContext("2d");
      resultCtx.drawImage(cropCanvas, 0, 0);

      return cropResult;
    };

    // 1. Center crop (standard square crop)
    const centerSize = Math.min(originalWidth, originalHeight);
    const centerX = (originalWidth - centerSize) / 2;
    const centerY = (originalHeight - centerSize) / 2;
    crops.push(createCrop(centerX, centerY, centerSize, centerSize));

    // 2. Multiple crops at different scales (90%, 75%, 60% of original)
    const scales = [0.9, 0.75, 0.6];

    scales.forEach((scale) => {
      const scaledSize = Math.floor(centerSize * scale);
      const scaledX = centerX + (centerSize - scaledSize) / 2;
      const scaledY = centerY + (centerSize - scaledSize) / 2;
      crops.push(createCrop(scaledX, scaledY, scaledSize, scaledSize));
    });

    // 3. Add 4 corner crops at 70% size
    const cornerSize = Math.floor(centerSize * 0.7);

    // Top-left
    crops.push(createCrop(0, 0, cornerSize, cornerSize));

    // Top-right
    crops.push(
      createCrop(originalWidth - cornerSize, 0, cornerSize, cornerSize)
    );

    // Bottom-left
    crops.push(
      createCrop(0, originalHeight - cornerSize, cornerSize, cornerSize)
    );

    // Bottom-right
    crops.push(
      createCrop(
        originalWidth - cornerSize,
        originalHeight - cornerSize,
        cornerSize,
        cornerSize
      )
    );

    return crops;
  },

  // Create an ensemble prediction function using multiple crops
  ensemblePrediction: async function (canvas, predictFn) {
    // First, enhance the image
    const enhancedCanvas = this.enhanceImage(canvas);

    // Create multiple crops
    const crops = this.createOptimizedCrops(enhancedCanvas);

    // Run predictions on all crops
    const predictions = [];

    for (let i = 0; i < crops.length; i++) {
      try {
        const result = await predictFn(crops[i]);
        predictions.push(result);
      } catch (e) {
        console.warn(`Error in prediction for crop ${i}:`, e);
      }
    }

    // Combine predictions (simple averaging)
    if (predictions.length === 0) {
      throw new Error("All predictions failed");
    }

    // Initialize arrays for each class
    const classScores = {};
    predictions[0].allProbabilities.forEach((p) => {
      classScores[p.name] = 0;
    });

    // Sum up probabilities
    predictions.forEach((prediction) => {
      prediction.allProbabilities.forEach((p) => {
        classScores[p.name] += p.probability;
      });
    });

    // Average and find highest
    let maxProb = 0;
    let maxClass = null;
    const allProbabilities = [];

    Object.keys(classScores).forEach((className) => {
      const avgProbability = classScores[className] / predictions.length;

      allProbabilities.push({
        name: className,
        probability: avgProbability,
      });

      if (avgProbability > maxProb) {
        maxProb = avgProbability;
        maxClass = className;
      }
    });

    return {
      className: maxClass,
      probability: maxProb,
      allProbabilities: allProbabilities,
    };
  },
};

// Export the utilities
window.ImageUtils = ImageUtils;
