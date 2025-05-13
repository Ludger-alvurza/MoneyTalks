// model_json_fix.js - Script to fix model.json file with missing input shape
// Run this script once to patch your model.json file

async function fixModelJson() {
  try {
    const modelPath = "./models_converted/model.json";

    // Load the model.json file
    const response = await fetch(modelPath);
    if (!response.ok) {
      throw new Error(
        `Failed to load model.json: ${response.status} ${response.statusText}`
      );
    }

    const modelJson = await response.json();
    console.log("Loaded model.json for fixing");

    // Check if modelTopology exists
    if (!modelJson.modelTopology) {
      throw new Error("Model topology not found in model.json");
    }

    // Check if the first layer exists
    const layers = modelJson.modelTopology.config?.layers || [];
    if (layers.length === 0) {
      throw new Error("No layers found in model topology");
    }

    // Find the first layer which is likely the input layer
    const firstLayer = layers[0];
    console.log("First layer:", firstLayer);

    // Fix input shape if it's missing
    if (
      firstLayer &&
      !firstLayer.config?.batchInputShape &&
      !firstLayer.config?.inputShape
    ) {
      console.log("Input shape missing, adding it now");

      // Add batch input shape [null, 224, 224, 3]
      firstLayer.config = firstLayer.config || {};
      firstLayer.config.batchInputShape = [null, 224, 224, 3];
      console.log("Added batch input shape to first layer:", firstLayer);

      // Save modified model.json
      const modifiedModelJson = JSON.stringify(modelJson);

      // Create a blob and download link for the user to save the fixed file
      const blob = new Blob([modifiedModelJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "fixed_model.json";
      a.textContent = "Download Fixed model.json";
      a.style.display = "block";
      a.style.margin = "20px 0";
      a.style.padding = "10px";
      a.style.backgroundColor = "#4CAF50";
      a.style.color = "white";
      a.style.textAlign = "center";
      a.style.textDecoration = "none";
      a.style.borderRadius = "5px";

      document.body.appendChild(a);

      console.log("Created download link for fixed model.json");
      return {
        success: true,
        message:
          "Model.json fixed. Download the fixed file and replace your original model.json",
      };
    } else {
      return {
        success: false,
        message:
          "Input shape already exists or model structure is not as expected",
      };
    }
  } catch (error) {
    console.error("Error fixing model.json:", error);
    return {
      success: false,
      message: `Error: ${error.message}`,
    };
  }
}

// Execute the fix function
fixModelJson().then((result) => {
  console.log(result);

  // Display message to user
  const messageDiv = document.createElement("div");
  messageDiv.style.margin = "20px 0";
  messageDiv.style.padding = "15px";
  messageDiv.style.borderRadius = "5px";
  messageDiv.style.backgroundColor = result.success ? "#DFF2BF" : "#FFBABA";
  messageDiv.style.color = result.success ? "#4F8A10" : "#D8000C";
  messageDiv.textContent = result.message;
  document.body.appendChild(messageDiv);
});
