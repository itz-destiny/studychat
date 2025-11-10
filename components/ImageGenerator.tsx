
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { ImageIcon, SparklesIcon } from './Icons';

type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerateImage = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: aspectRatio,
        },
      });

      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
      setGeneratedImage(imageUrl);

    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to generate image. ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800/50 rounded-lg shadow-xl p-4 md:p-6">
      <div className="flex-shrink-0 text-center pb-4 border-b border-gray-700">
        <h2 className="text-2xl font-bold">Image Generator</h2>
        <p className="text-gray-400 mt-1">Create stunning visuals with AI.</p>
      </div>

      <div className="flex-grow flex flex-col md:flex-row gap-6 mt-6">
        {/* Controls */}
        <div className="md:w-1/3 space-y-6">
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">
              Prompt
            </label>
            <textarea
              id="prompt"
              rows={5}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g., A majestic lion wearing a crown, cinematic lighting"
              className="w-full bg-gray-700 text-gray-200 rounded-lg p-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>
          <div>
            <label htmlFor="aspect-ratio" className="block text-sm font-medium text-gray-300 mb-2">
              Aspect Ratio
            </label>
            <select
              id="aspect-ratio"
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value as AspectRatio)}
              className="w-full bg-gray-700 text-gray-200 rounded-lg p-3 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
            >
              <option value="1:1">Square (1:1)</option>
              <option value="16:9">Landscape (16:9)</option>
              <option value="9:16">Portrait (9:16)</option>
              <option value="4:3">Standard (4:3)</option>
              <option value="3:4">Tall (3:4)</option>
            </select>
          </div>
          <button
            onClick={handleGenerateImage}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 shadow-lg"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                Generate Image
              </>
            )}
          </button>
        </div>

        {/* Display Area */}
        <div className="md:w-2/3 flex-grow flex items-center justify-center bg-gray-900/50 rounded-lg p-4 border-2 border-dashed border-gray-700">
          {error && <p className="text-red-400 text-center">{error}</p>}
          {!isLoading && !generatedImage && !error && (
            <div className="text-center text-gray-500">
              <ImageIcon className="w-16 h-16 mx-auto mb-2" />
              <p>Your generated image will appear here.</p>
            </div>
          )}
          {isLoading && !error && (
            <div className="text-center text-gray-400">
              <p className="text-lg font-semibold animate-pulse">Creating masterpiece...</p>
              <p className="text-sm mt-1">This may take a moment.</p>
            </div>
          )}
          {generatedImage && (
            <img src={generatedImage} alt="Generated by AI" className="max-w-full max-h-full object-contain rounded-md shadow-lg" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator;
