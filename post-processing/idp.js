// entity.tokenClassificationResult
// entity.reprocessFlag

const VIEW_MODE = false;  // The view mode determines if the page resolution object and the box coordinates are added to the output
const FULL_ROW = false;  // True means return only full course records
const MAX_DEVIATION = 10.0;

const missingEntityWeights = { // Entity labels and their corresponding weights
  "STUDENTID": 2,
  "STUDENTNAME": 3,
  "INSTITUTE": 2
};

// Initialize variables for the output
var interJSON = [];
var outputJSON = {};
var creditArray = [];
var pageArray = [];
var instituteName = "";
var studentNameScore = 0.0;
var issueDateScore = 0.0;

// Exclude some institute names
const instituteFilter = /(?:Wingate|Wingate University|HCC Production)/im;

function postProcessing(postProcessingData) {


    let newIdpResponse = [];
    let pagesSizes = [];
    let tableColumns = ['SUBJECT','TITLE','CREDITS','GRADE','SESSION','YEAR', 'POINTS'];
    var pageCounter = 0;
    // Loop for all content
    for (const pageContent of postProcessingData) {
        //pagesSizes.push(pageContent.shift());

        //Loop for page Content
        for (const word of pageContent) {
            if (word.hasOwnProperty('width')) {
                    pagesSizes.push({
                        page: pageCounter,
                        width: word.width,
                        height: word.height
                    });
                continue;
            }
            newIdpResponse[pageCounter] = [];
            if(Array.isArray(word)){
                let mergedWords = mergeMultipleArrayWords(word);
                for (const value of mergedWords) {
                    newIdpResponse[pageCounter].push(value);
                }
            } else {
                word.box = word.box.split(', ');
                newIdpResponse[pageCounter].push(word);
            }
        }
        //console.log(JSON.stringify(pageContent));
        pageCounter++;
    }
    console.log(JSON.stringify(newIdpResponse));


    console.log('finnnnnnnnnnnn');
}
function mergeMultipleArrayWords(arrayWord) {
    // Get Words
    let labels = [];
    for (const word of arrayWord) {
        if (word.label.includes(labels)) {
            labels.push(word.label)
        }
    }
    // Compose an array by word
    let arraySingleWord = [];
    for (const label of labels) {
        let arrayWordTemp = arrayWord;
        let filtered = arrayWordTemp.filter(word => {
            return word.label == label;
        });
        let singleWord = mergeSingleArrayWords(arrayWordTemp);
        //console.log('jajajajajajajaj');
        arraySingleWord.push(singleWord);
    }
    return arraySingleWord;
}

function mergeSingleArrayWords(arrayWord) {
    let box = [];
    let line = "";
    let word = '';
    let block = '';
    let index = '';
    let label = '';
    let score = 0;
    let prediction = '';
    let wordInLineNum = '';
    let key = 0;
    for (const value of arrayWord) {
        //console.log(JSON.stringify(value), 'uuuuuuuuuuuuuu');
        let corners = value.box.split(', ');
        if(key == 0) {
            box[0] = corners[0];
            box[1] = corners[1];
            line = value.line;
            block = value.block;
            index = value.index;
            label = value.label;
            prediction = value.label;
            wordInLineNum = value.wordInLineNum;
        }
        score = score + value.score;
        box[2] = corners[2];
        box[3] = corners[3];
        word += value.word || "";

    }
    return {
        box: box,
        line: line,
        word: word.trim(),
        block: block,
        index: index,
        label: label,
        score: parseFloat((parseFloat(score) / arrayWord.lenght).toFixed(5)),
        prediction: prediction,
        wordInLineNum: wordInLineNum,
    };
}


// EXECUTION; Only execute the script when document type is TRANSCRIPT and model classification result is available
if (entity.documentType === "TRANSCRIPT" && entity.tokenClassificationResult) {

    var postProcessingData = JSON.parse(entity.tokenClassificationResult);
    var postProcessingInfo = postProcessing(postProcessingData);
    return postProcessingInfo;


}
//JSON.stringify(outputJSON);