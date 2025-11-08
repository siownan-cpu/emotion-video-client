const [isConnected, setIsConnected] = useState(false);
const [copied, setCopied] = useState(false);
const [meteredApiKey, setMeteredApiKey] = useState(import.meta.env.VITE_METERED_API_KEY || '2ad5a09d363a45ccaf335c6dc36acf9cad87');
  const [showMeteredInput, setShowMeteredInput] = useState(false);

const [availableDevices, setAvailableDevices] = useState({
videoInputs: [],
@@ -1235,20 +1236,38 @@ const EmotionVideoCallWithWebRTC = () => {
</div>

<div className="mb-6">
                <label htmlFor="metered-api-key" className="block text-sm font-medium text-gray-700 mb-2">
                  Metered API Key
                </label>
                <input
                  id="metered-api-key"
                  type="text"
                  value={meteredApiKey}
                  onChange={(e) => setMeteredApiKey(e.target.value)}
                  placeholder="Enter your Metered API key"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Required for reliable connection. Get a free key from <a href="https://www.metered.ca/tools/openrelay" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Metered Open Relay</a>.
                </p>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Metered API Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowMeteredInput(!showMeteredInput)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                  >
                    {showMeteredInput ? 'Hide' : 'Manual Input'}
                  </button>
                </div>
                
                {showMeteredInput ? (
                  <>
                    <input
                      id="metered-api-key"
                      type="text"
                      value={meteredApiKey}
                      onChange={(e) => setMeteredApiKey(e.target.value)}
                      placeholder="Enter your Metered API key"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-2 text-sm text-gray-500">
                      Required for reliable connection. Get a free key from <a href="https://www.metered.ca/tools/openrelay" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Metered Open Relay</a>.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-green-600 text-sm">✓ API key configured</span>
                  </div>
                )}
</div>

<div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
