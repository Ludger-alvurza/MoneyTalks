// camera.js - Enhanced camera handling with multiple resolution support

const Camera = {
  video: null,
  canvas: null,
  stream: null,
  currentFacingMode: "environment", // Default to back camera

  init: async function () {
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("canvas");

    if (!this.video || !this.canvas) {
      console.error("Video or canvas element not found");
      return false;
    }

    try {
      // Try progressive camera configurations
      const configs = [
        // Try full HD first for back camera
        {
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { exact: "environment" },
          },
        },
        // Try HD for back camera
        {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { exact: "environment" },
          },
        },
        // Try any resolution for back camera
        {
          video: {
            facingMode: "environment",
          },
        },
        // Fallback to front camera with HD
        {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
        },
        // Last resort: any camera
        {
          video: true,
        },
      ];

      // Try each configuration until one works
      let stream = null;
      let error = null;
      let usedConfig = null;

      for (let i = 0; i < configs.length; i++) {
        try {
          console.log(`Trying camera config #${i + 1}:`, configs[i]);
          stream = await navigator.mediaDevices.getUserMedia(configs[i]);
          usedConfig = configs[i];
          break; // Exit loop if successful
        } catch (e) {
          error = e;
          console.warn(`Camera config #${i + 1} failed:`, e.message);
        }
      }

      if (!stream) {
        throw error || new Error("Unable to access any camera");
      }

      // Store which facing mode was actually used
      if (usedConfig && usedConfig.video && usedConfig.video.facingMode) {
        this.currentFacingMode =
          typeof usedConfig.video.facingMode === "object"
            ? usedConfig.video.facingMode.exact
            : usedConfig.video.facingMode;
      } else {
        // If we're using the fallback without facingMode specified, assume it's user
        this.currentFacingMode = "user";
      }

      console.log(`Camera started with facing mode: ${this.currentFacingMode}`);

      this.stream = stream;
      this.video.srcObject = stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          // Set canvas dimensions to match video
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          console.log(
            `Camera resolution: ${this.video.videoWidth}x${this.video.videoHeight}`
          );
          resolve(true);
        };
      });
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert(`Gagal mengakses kamera: ${error.message}`);
      return false;
    }
  },

  takePhoto: function () {
    if (!this.video || !this.canvas) {
      console.error("Video or canvas not initialized");
      return null;
    }

    const context = this.canvas.getContext("2d");

    // Apply preprocessing directly during photo capture

    // 1. Draw video frame to canvas
    context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

    // 2. Apply enhancement filters (optional)
    // Note: These can help with currency note recognition by enhancing details
    try {
      // Minor contrast and brightness adjustments
      context.filter = "contrast(110%) brightness(105%)";
      context.drawImage(this.canvas, 0, 0);
      context.filter = "none";
    } catch (e) {
      // Filter not supported in this browser, ignore
      console.warn("Image filters not supported in this browser");
    }

    // 3. Convert canvas to image with high quality
    const imageDataUrl = this.canvas.toDataURL("image/jpeg", 0.95);

    return imageDataUrl;
  },

  // Switch between front and back cameras if possible
  switchCamera: async function () {
    // Stop current camera
    this.stopCamera();

    // Toggle facing mode
    this.currentFacingMode =
      this.currentFacingMode === "environment" ? "user" : "environment";

    // Try to initialize with new facing mode
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: this.currentFacingMode,
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;

      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          // Update canvas dimensions
          this.canvas.width = this.video.videoWidth;
          this.canvas.height = this.video.videoHeight;
          console.log(
            `Switched camera to: ${this.currentFacingMode}, resolution: ${this.video.videoWidth}x${this.video.videoHeight}`
          );
          resolve(true);
        };
      });
    } catch (error) {
      console.error("Error switching camera:", error);

      // If switching failed, try to restart the previous camera
      try {
        await this.init();
        return true;
      } catch (e) {
        console.error("Failed to restore camera:", e);
        return false;
      }
    }
  },

  // Add automatic focus if supported
  autoFocus: function () {
    if (!this.stream) return false;

    try {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const capabilities = videoTrack.getCapabilities();
      if (!capabilities.focusMode) return false;

      if (capabilities.focusMode.includes("continuous")) {
        const constraints = {
          advanced: [{ focusMode: "continuous" }],
        };
        videoTrack.applyConstraints(constraints);
        console.log("Auto-focus enabled");
        return true;
      }
    } catch (e) {
      console.warn("Could not enable auto-focus:", e);
    }

    return false;
  },

  // Add flash/torch if supported
  toggleTorch: async function (state) {
    if (!this.stream) return false;

    try {
      const videoTrack = this.stream.getVideoTracks()[0];
      if (!videoTrack) return false;

      const capabilities = videoTrack.getCapabilities();
      if (!capabilities.torch) return false;

      await videoTrack.applyConstraints({
        advanced: [{ torch: !!state }],
      });

      console.log(`Torch ${state ? "enabled" : "disabled"}`);
      return true;
    } catch (e) {
      console.warn("Could not toggle torch:", e);
      return false;
    }
  },

  stopCamera: function () {
    if (this.stream) {
      const tracks = this.stream.getTracks();
      tracks.forEach((track) => track.stop());
      this.stream = null;

      if (this.video) {
        this.video.srcObject = null;
      }

      console.log("Camera stopped");
    }
  },
};
