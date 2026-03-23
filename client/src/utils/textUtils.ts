/**
 * Utility for text manipulation and autocorrect patterns.
 */

const autocorrectMap: Record<string, string> = {
    'teh': 'the',
    'realy': 'really',
    'dont': "don't",
    'cant': "can't",
    'wont': "won't",
    'id': "I'd",
    'im': "I'm",
    'ive': "I've",
    'youre': "you're",
    'theyre': "they're",
    'hes': "he's",
    'shes': "she's",
    'its': "it's",
    'isnt': "isn't",
    'arent': "aren't",
    'wasnt': "wasn't",
    'werent': "weren't",
    'doesnt': "doesn't",
    'didnt': "didn't",
    'havent': "haven't",
    'hasnt': "hasn't",
    'hadnt': "hadn't",
    'couldnt': "couldn't",
    'shouldnt': "shouldn't",
    'wouldnt': "wouldn't",
    'recieve': 'receive',
    'believe': 'believe', // common typo variant
    'occured': 'occurred',
    'seperate': 'separate',
    'definately': 'definitely',
    'tommorow': 'tomorrow',
    'tomorrow': 'tomorrow',
    'thanks': 'Thanks',
    'hello': 'Hello',
};

/**
 * Automatically corrects common typos and contractions in a given text string.
 * This is designed to be called on every change, but typically triggers 
 * its replacement logic when a space or punctuation is detected.
 */
export const applyAutoCorrect = (text: string): string => {
    if (!text) return text;

    // Check if the last character is a space or punctuation
    const lastChar = text[text.length - 1];
    const isTrigger = /[\s.,!?;:]/.test(lastChar);

    if (!isTrigger) return text;

    // Split text into words and punctuation
    const words = text.split(/([\s.,!?;:])/);
    
    // We only want to check the word just completed (the one before the last trigger)
    // The words array will look like: ["word1", " ", "word2", "!", ""]
    // if the last char was "!", the last word is at index length - 3
    const lastWordIndex = words.length - 3;
    if (lastWordIndex < 0) return text;

    const lastWord = words[lastWordIndex];
    if (!lastWord) return text;

    const lowerWord = lastWord.toLowerCase();
    
    if (autocorrectMap[lowerWord]) {
        // If it was "i", capitalize it specifically if it matches certain patterns
        let replacement = autocorrectMap[lowerWord];
        
        // Preserve case if original was capitalized (optional, but good)
        if (lastWord[0] === lastWord[0].toUpperCase() && lastWord.length > 1) {
            replacement = replacement[0].toUpperCase() + replacement.slice(1);
        }

        words[lastWordIndex] = replacement;
        return words.join('');
    }

    // Special case for standalone 'i'
    if (lowerWord === 'i') {
        words[lastWordIndex] = 'I';
        return words.join('');
    }

    return text;
};
