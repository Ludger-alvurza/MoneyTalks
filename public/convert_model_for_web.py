"""
Money Talks - Model Conversion Script
This script properly converts a TensorFlow/Keras model to TensorFlow.js format
addressing common issues with input shapes and custom layers.
"""

import os
import tensorflow as tf
import tensorflowjs as tfjs
import argparse
from tensorflow.keras.models import load_model

def fix_and_convert_model(input_model_path, output_dir):
    """
    Load a Keras model, fix common issues, and convert it to TensorFlow.js format
    
    Args:
        input_model_path: Path to the .h5 model file
        output_dir: Directory to save the converted model
    """
    print(f"Loading model from {input_model_path}...")
    
    # Load the original model
    model = load_model(input_model_path, compile=False)
    
    # Fix: Explicitly set input shape
    input_shape = model.input_shape[1:]  # Get shape without batch dimension
    print(f"Original input shape: {input_shape}")
    
    # Create a new model with explicit input layer to avoid the InputLayer error
    input_layer = tf.keras.layers.Input(shape=input_shape, name='explicit_input')
    
    # If the first layer is a rescaling layer (which causes problems in tfjs),
    # replace it with a Lambda layer to perform the same operation
    if isinstance(model.layers[0], tf.keras.layers.Rescaling):
        print("Found Rescaling layer, replacing with Lambda...")
        scale = model.layers[0].scale
        offset = model.layers[0].offset
        x = tf.keras.layers.Lambda(
            lambda x: x * scale + offset,
            name='manual_rescaling'
        )(input_layer)
    else:
        x = input_layer
    
    # Pass the input through all remaining layers
    # Skip the original input layer (and rescaling if replaced)
    start_idx = 1 if isinstance(model.layers[0], tf.keras.layers.Rescaling) else 0
    for layer in model.layers[start_idx:]:
        # Skip any InputLayer
        if isinstance(layer, tf.keras.layers.InputLayer):
            continue
        x = layer(x)
    
    # Create a new model
    fixed_model = tf.keras.models.Model(inputs=input_layer, outputs=x)
    
    # Copy weights from original model
    for i, layer in enumerate(fixed_model.layers[1:], 1):  # Skip input layer
        try:
            layer_idx = model.layers.index(layer)
            layer.set_weights(model.layers[layer_idx].get_weights())
        except (ValueError, IndexError):
            print(f"Warning: Could not transfer weights for layer {layer.name}")
    
    # Save the fixed model temporarily
    temp_model_path = 'temp_fixed_model.h5'
    fixed_model.save(temp_model_path)
    print(f"Fixed model saved temporarily to {temp_model_path}")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Convert to TensorFlow.js format
    print(f"Converting model to TensorFlow.js format in {output_dir}...")
    tfjs.converters.save_keras_model(fixed_model, output_dir)
    
    # Clean up
    os.remove(temp_model_path)
    
    print(f"Conversion complete! Model saved to {output_dir}")
    print("The model should now load properly in TensorFlow.js")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Convert Keras model to TensorFlow.js')
    parser.add_argument('--input', required=True, help='Path to input .h5 model file')
    parser.add_argument('--output', default='./models_converted', help='Output directory')
    
    args = parser.parse_args()
    fix_and_convert_model(args.input, args.output)
    
    print("\nUsage instructions:")
    print("1. Copy the entire 'models_converted' folder to your web app")
    print("2. Make sure to load the model with: tf.loadLayersModel('./models_converted/model.json')")