// List of flagged abusive/inappropriate keywords (can be expanded)
const FLAGGED_KEYWORDS = [
  'abuse', 'bastard', 'bitch', 'asshole', 'fuck', 'shit', 'cunt', 'dick', 
  'retard', 'scam', 'whore', 'slut', 'idiot', 'moron', 'kill yourself', 
  'threat', 'harass'
];

/**
 * Scans a text message for known inappropriate keywords and replaces them with asterisks.
 * Also returns whether a match was found.
 */
const censorMessageContent = (text) => {
  if (!text || typeof text !== 'string') return { censoredText: '', isFlagged: false, matches: [] };

  let isFlagged = false;
  let censoredText = text;
  const matches = [];

  const lowerText = text.toLowerCase();
  
  FLAGGED_KEYWORDS.forEach(word => {
    // Escape word to be regex-safe
    const escapedWord = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
    
    if (regex.test(lowerText)) {
      isFlagged = true;
      matches.push(word);
      censoredText = censoredText.replace(regex, '*'.repeat(word.length));
    }
  });

  return {
    censoredText,
    isFlagged,
    matches
  };
};

/**
 * Simulates AI Toxicity Classification.
 * In a production server, this sends an HTTP request to Google Perspective API or OpenAI Moderation API.
 */
const evaluateToxicityScore = async (text) => {
  if (!text) return { isToxic: false, score: 0, categories: {} };

  // Artificial analysis latency (e.g., 50ms) to mimic API call
  await new Promise(resolve => setTimeout(resolve, 50));

  const lowerText = text.toLowerCase();
  let score = 0.05; // Standard base rating for neutral sentences
  const categories = {
    toxicity: false,
    severe_toxicity: false,
    insult: false,
    threat: false,
    harassment: false
  };

  // Flag extreme triggers in text
  const highToxicityTriggers = ['kill yourself', 'die', 'threaten', 'idiot', 'bitch', 'fuck'];
  const matchingTriggers = highToxicityTriggers.filter(word => lowerText.includes(word));

  if (matchingTriggers.length > 0) {
    // Generate high score
    score = Math.min(0.6 + (matchingTriggers.length * 0.15), 0.99);
  }

  // Set category flags if score is elevated
  if (score > 0.5) {
    categories.toxicity = true;
    if (score > 0.8) categories.severe_toxicity = true;
    
    if (lowerText.includes('kill') || lowerText.includes('die')) {
      categories.threat = true;
    }
    if (lowerText.includes('idiot') || lowerText.includes('bitch')) {
      categories.insult = true;
      categories.harassment = true;
    }
  }

  return {
    isToxic: score > 0.75, // Toxicity threshold
    score,
    categories
  };
};

module.exports = {
  censorMessageContent,
  evaluateToxicityScore
};
