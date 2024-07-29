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

// Function to calculate average score with 5 decimals
function calculateAverageScore(objArray) {
	const totalScore = objArray.reduce((sum, obj) => sum + obj.score, 0);
	return parseFloat((totalScore / objArray.length).toFixed(5));
}

function monthNameToNumber(monthName) {
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04',
    may: '05', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12'
  };

  return months[monthName.trim().substring(0, 3).toLowerCase()] || '';
}

function formatDate(dateString){
	// First trim the string and replace dashes by slash
 	dateString = dateString.trim().replaceAll('-', '/');
  // remove , character
  dateString = dateString.replaceAll(',', '');

	// Change a 2-digit year in to a 4-digit year
	const lastSlashIndex = dateString.lastIndexOf('/');
  let modString = dateString;
	if (lastSlashIndex !== -1 && dateString.length == (lastSlashIndex + 3))
		{modString = dateString.slice(0, lastSlashIndex + 1) + '20' + dateString.slice(lastSlashIndex + 1);}
	// Capture the month and verify is this is the number or a month name
	const regex = /(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
	const match = modString.match(regex);
	if (match)
	{
		let monthNumber = monthNameToNumber(match[0]);
		modString = modString.replace(match[0],monthNumber);
		// Swap day and month in case string not starts with month number
		if (monthNumber !== modString.substring(0, 2))
			{modString = modString.substring(3, 5) + "/" + modString.substring(0, 2) + "/" + modString.substring(6, 10);}
		else
		{
			if (modString.length == 10) {modString = modString.substring(0, 2) + "/" + modString.substring(3, 5) + "/" + modString.substring(6, 10);}
			if (modString.length == 7) {modString = modString.substring(0, 2) + "/" + modString.substring(3, 7);}
		}
	}
  return modString;
}

// Function to validate year and split session if applicable like 2022FA
function validateYear(stringYear) {
	const matchYear = stringYear.match(/(?<year>\d{2,4})(?:\/|-)?(?<session>FA|SP|SP3|SU)?\d{0,4}/im);
	let {year, session} = matchYear.groups;
	switch (session) {
		case "FA":
		case "FALL" :
			session = "Fall";
			break;
		case "SP" :
		case "SP1" :
		case "SP2" :
		case "SP3" :
			session = "Spring";
			break;
		case "SU" :
			session = "Summer";
			break;
		default :
			session = "";
	}
  return [year, session];
}

// Function to calculate the confidence extraction score
function calculateConfidenceScore(interJSON, missingEntityWeights) {
  // Initialize variables to keep track of total score and total weight
  let totalScore = 0;
  let totalWeight = 0;
  // Iterate through the elements in the JSON array
  for (const element of interJSON) {
    // Check if the element has a "score" property
    if (element.hasOwnProperty("score")) {
      totalScore += element.score; // Add the score to the total score
    }
  }
  // Iterate through the missing entities and calculate their contribution to the total weight
  for (const label in missingEntityWeights) {
    if (!interJSON.some(element => element.label === label)) {
      const weight = missingEntityWeights[label];
      totalWeight += weight; // Adding the weight to the total weight
    }
  }
  // Calculate the average score of available entities
  const averageScore = interJSON.length > 0 ? totalScore / interJSON.length : 0;
  // Calculate the weightedMissingScore by dividing the sum of the weights of the missing entities by the total weight of the missingEntityWeights and by multiplying this outcome times 0.5
  const weightedMissingScore = (totalWeight / Object.values(missingEntityWeights).reduce((acc, val) => acc + val, 0)) * 0.5;
  // Calculate the overall confidence score by subtracting the weighted missing score from the average score
  const calculatedScore = (averageScore - weightedMissingScore).toFixed(4);

  return calculatedScore;
}

// Function to filter and remove objects from the array
function filterInterJSON(arr) {
  // Create a map to track labels for each page
  const labelMap = new Map();
	//const requiredLabels = ['SUBJECT', 'CREDITS', 'GRADE'];
  const requiredLabels = ['SUBJECT', 'TITLE'];

  // Populate the labelMap
  arr.forEach(({ page, label }) => {
    const allowedLabels = [...requiredLabels, 'GPATOT', 'INSTITUTE'];
    if (allowedLabels.includes(label)) {
      labelMap.set(page, labelMap.get(page) || new Set());
      labelMap.get(page).add(label);
    }
  });

  // Filter objects based on the specified conditions
  const filteredInterJSON = arr.filter(({ page, label }) => {
    const labelsOnPage = labelMap.get(page);
    const hasRequiredLabels = requiredLabels.every(requiredLabel => labelsOnPage && labelsOnPage.has(requiredLabel));
    const isAllowedLabel = ['GPATOT', 'INSTITUTE'].includes(label);

    // Keep all objects for pages with required labels
    // Keep only 'GPATOT' or 'INSTITUTE' objects for pages without required labels
    return hasRequiredLabels || (isAllowedLabel && labelsOnPage && labelsOnPage.has(label));
  });

  return filteredInterJSON;
}

function findPrevYearSession(pageNum, filteredInterJSON) {
  const result = {};
  let maxYear = null;
  let maxSession = null;

  for (const obj of filteredInterJSON) {
    if (obj.page !== pageNum) {
      continue;
    }
    if (obj.label === 'YEAR' && (!maxYear || isMaxObjectIndex(obj, maxYear))) {
      maxYear = obj;
    }
    if (obj.label === 'SESSION' && (!maxSession || isMaxObjectIndex(obj, maxSession))) {
      maxSession = obj;
    }
  }
  result.Year = maxYear ? maxYear.word : "";
  result.Session = maxSession ? maxSession.word : "";

  return result;
}

function isMaxObjectIndex(obj, max) {
  return (obj.index > max.index);
}

// Helper function to check if two objects are part of the same block, same line on the same page
 function belongToGroup_box(inObj, subObj) {
    return inObj.page === subObj.page &&  Math.abs(parseFloat(subObj.box.split(',')[1]) - parseFloat(inObj.box.split(',')[1])) <= MAX_DEVIATION && (inObj.index - subObj.index) > 0;
}

function yearPosition(filteredInterJSON) {
  // Find the first object with label "YEAR"
  const yearObject = filteredInterJSON.find(item => item.label === 'YEAR');
  // Find the first object with label "GRADE" in the near of the "YEAR" object
  var gradeObject;
  if (yearObject){
    gradeObject = filteredInterJSON.find(item => item.label === 'GRADE' && item.index > yearObject.index);
  }else{
    gradeObject = filteredInterJSON.find(item => item.label === 'GRADE');
  }
  // Check if both objects are found
  if (yearObject && gradeObject) {
    // Compare the indices and the x positions
    return ((yearObject.index < gradeObject.index || Math.abs(parseFloat(gradeObject.box.split(',')[1]) - parseFloat(yearObject.box.split(',')[1])) < 15) || (Math.abs(parseFloat(gradeObject.box.split(',')[0]) - parseFloat(yearObject.box.split(',')[0])) > 300)) ? 'ABOVE' : 'BELOW';
  } else {
    // Default to "ABOVE" if either "YEAR" or "GRADE" is not found
    return 'ABOVE';
  }
}

// Function for grouping objects based on label
function groupObjects(filteredInterJSON) {
  const creditSets = [];
  let currentSubject = null;
  let currentSet = [];

  for (const objectIt of filteredInterJSON) {
    if (objectIt.label === 'SUBJECT') {
      // New subject, start a new group
      //console.log("SUBJ: " +objectIt.word);
      if (currentSet.length > 0) {
        // Check if the current set is complete before starting a new subject
        if ((!FULL_ROW && currentSet.length >= 2) || currentSet.length === 4) {
          creditSets.push(...currentSet);
          currentSet = [];
        }
      }
      if (currentSet.length === 0) {
      	currentSubject = objectIt;
		currentSet.push(currentSubject);
      }
      if (currentSet.length === 1) {
        currentSubject = objectIt;
		currentSet[0] = currentSubject;
      }
    } else if (currentSubject && ['TITLE', 'GRADE', 'CREDITS'].includes(objectIt.label) && belongToGroup_box(objectIt, currentSubject)) {
      currentSet.push(objectIt);
    }
  }
  // Check if the last set is complete before returning
  if (currentSet.length >= 2 && (!FULL_ROW || currentSet.length === 4)) {
    creditSets.push(...currentSet);
  }
  return creditSets;
}

function findYearSession(indexSubject, xSubject, page, system, filteredInterJSON) {
  const result = {
    Year: "",
	//Year_box: "",
    Session: "",
	//Session_box: ""
  };
  let MAX_LEFT = 300; // default for 72 dpi document
  // Calculate the maximum pixels based on the left half of a page, being 0.4 x page width
  if (page >= 1 && pageArray.length >= page) MAX_LEFT =  Math.round(pageArray[page-1].Width * 0.4);

  let posColumn = "LEFT";
  if (Math.round(xSubject) >= MAX_LEFT) {posColumn = "RIGHT"}
  MAX_LEFT = MAX_LEFT + 60; // Extend to catch exceptions

  var relevantObjects = filteredInterJSON.filter(obj => {
    return (
      (obj.label === "SESSION" || obj.label === "YEAR") &&
      obj.page === page && !obj.word.includes('/') && !obj.word.includes('\\') &&
      ((system === "ABOVE" && obj.index < indexSubject && posColumn === "LEFT" && parseFloat(obj.box.split(',')[0]) < MAX_LEFT) ||
       (system === "ABOVE" && obj.index < indexSubject && posColumn === "RIGHT" && parseFloat(obj.box.split(',')[0]) >= MAX_LEFT) ||
       (system === "BELOW" && obj.index > indexSubject && posColumn === "left" && parseFloat(obj.box.split(',')[0]) < MAX_LEFT) ||
       (system === "BELOW" && obj.index > indexSubject && posColumn === "RIGHT" && parseFloat(obj.box.split(',')[0]) >+ MAX_LEFT))
    );
  });

  if (relevantObjects.length === 0) {
    // If no relevant objects found, call findPrevYearSession to find the last Year and Session on the previous page
    return findPrevYearSession(page-1, filteredInterJSON);
  }
  if (system === "ABOVE") relevantObjects.reverse();

  let res_year = relevantObjects.find(obj => obj.label === "YEAR");
  if (res_year) {res_year = res_year.word;}
  else {return findPrevYearSession(page-1, filteredInterJSON);}

  let res_year_f = "";
  let res_session_f = "";
  if (res_year) {
    	res_year_f = validateYear(res_year)[0];
  		res_session_f = validateYear(res_year)[1];
  }

  if (res_session_f == "") { // In case year and session not combined
     		res_session_f = relevantObjects.find(obj => obj.label === "SESSION");
  			if (res_session_f) res_session_f = res_session_f.word;
    		else res_session_f = "";
  }
  result.Year = res_year_f;
  //console.log(res_year);
  //result.Year_box = page + ":" +relevantObjects.find(obj => obj.label === "YEAR").box;
  result.Session = res_session_f;
  //result.Session_box = page + ":" +relevantObjects.find(obj => obj.label === "SESSION").box;

  return result;
}

// EXECUTION; Only execute the script when document type is TRANSCRIPT and model classification result is available

if (entity.documentType === "TRANSCRIPT" && entity.tokenClassificationResult)
{
  var inputJSON = JSON.parse(entity.tokenClassificationResult);
  var pageCounter = 0;
	for (const outerArray of inputJSON)
	{
    pageCounter++;
		// Process each element of the outerArray
		for (const item of outerArray)
		{
			if (item.hasOwnProperty('width'))
			{
				pageArray.push
				({
					Page: pageCounter,
					Width: item.width,
					Height: item.height
				});
			continue;
			}

			// Check if the item is an array or a single object
			if (Array.isArray(item))
			{
				// Extract objects with the same label attribute
				const labelObjects = {};
				item.forEach(obj => {
					const label = obj.label;
					if (!label.includes("_ID"))
					{
						// Skip items with labels containing "_ID"
						if (!labelObjects[label]) {labelObjects[label] = [];}
						labelObjects[label].push(obj);
					}
				});

				// Merge word values
				const mergedObjects = Object.values(labelObjects).map(objArray => {
					const mergedValue = objArray.map(obj => obj.word).join(" ");
					return {
						"index": objArray[objArray.length - 1].index,
						"page": pageCounter,
						"word": mergedValue,
						"label": objArray[0].label,
						"score": calculateAverageScore(objArray),
						"box": objArray[0].box,
						"block": objArray[0].block,
						"line": objArray[0].line,
						"wordInLineNum": objArray[objArray.length - 1].wordInLineNum
					};
				});

				// Determine new box coordinates for objects with multiple items
				mergedObjects.forEach(objArray => {
					if (objArray.length > 1)
					{
						const firstBoxCoords = objArray[0].box.split(", ");
						const lastBoxCoords = objArray[objArray.length - 1].box.split(", ");
						const newBox = `${firstBoxCoords[0]}, ${lastBoxCoords[1]}, ${firstBoxCoords[2]}, ${firstBoxCoords[3]}`;
						objArray.box = newBox;
					}
				});

				// Add the merged objects to the output
				interJSON = interJSON.concat(mergedObjects);
			} else
			{
				// If it's a single object group certain items which are on the same line and skip the supporting items met _ID in the label name
				if (!item.label.includes("_ID"))
				{
					item.page = pageCounter;
					interJSON.push(item);
				}
			}
		}
	}

	// Filter the interJSON for pages not containing any courses to prevent unnecessary processing and errors
	var filteredInterJSON = filterInterJSON(interJSON);

	if (VIEW_MODE) outputJSON.Pages = pageArray;
	// Use the filtered interJSON to transform data to the final output format
	for (const item2 of filteredInterJSON)
	{
		switch (item2.label) {
			case "STUDENTID" :
				outputJSON.Student_ID_Number = item2.word;
				if (VIEW_MODE) outputJSON.Student_ID_Number_box = item2.page + ":" + item2.box;
				break;
			case "STUDENTNAME" :
				if (studentNameScore == 0.0 || item2.score > studentNameScore)
				{
					studentNameScore = item2.score;
          const titleRegex = /^(Ms\.|Mr\.)\s/i;
          let tmpStudentName = item2.word;

    			// Check if the name starts with "Ms." or "Mr."
   				if (titleRegex.test(tmpStudentName)) {
        		// Remove the title from the string
        		tmpStudentName = tmpStudentName.replace(titleRegex, '');
    			}
					outputJSON.Student_Name = tmpStudentName;
					if (VIEW_MODE) outputJSON.Student_Name_box = item2.page + ":" + item2.box;
				}
				break;
			case "MAJOR" :
				outputJSON.Major = item2.word;
				if (VIEW_MODE) outputJSON.Major_box = item2.page + ":" + item2.box;
				break;
			case "MINOR" :
				outputJSON.Minor = item2.word;
				if (VIEW_MODE) outputJSON.Minor_box = item2.page + ":" + item2.box;
				break;
			case "IDATE" :
				if (issueDateScore == 0.0 || item2.score > issueDateScore)
				{
					issueDateScore = item2.score;
					outputJSON.Issue_Date = formatDate(item2.word);
					if (VIEW_MODE) outputJSON.Issue_Date_box = item2.page + ":" + item2.box;
				}
				break;
			case "INSTITUTE" :
				if (instituteName == "" || item2.word.length > instituteName.length)
				{
					instituteName = item2.word;
					outputJSON.Institution = item2.word;
					if (VIEW_MODE) outputJSON.Institution_box = item2.page + ":" + item2.box;
				}
				if (item2.word.match(instituteFilter))
				{
					outputJSON.Institution = "Highland Community College";
				}
				break;
			case "INSTCITY" :
				outputJSON.Institute_City = item2.word;
				if (VIEW_MODE) outputJSON.Institute_City_box = item2.page + ":" + item2.box;
				break;
			case "GPATOT" :
				outputJSON.GPA = item2.word;
				if (VIEW_MODE) outputJSON.GPA_box = item2.page + ":" + item2.box;
				break;
			case "GRADDATE" :
				outputJSON.Graduation_Date = item2.word;
				if (VIEW_MODE) outputJSON.Graduation_Date_box = item2.page + ":" + item2.box;
				break;
		}
	}
	// Determine the position of the Year (and Session), e.g. ABOVE or BELOW the courses
	const posYear = yearPosition(filteredInterJSON);

  // Group the course objects
	const groupedObjects = groupObjects(filteredInterJSON);
	let subjectObj = null;

	groupedObjects.forEach(obj => {
		if (obj.label === 'SUBJECT') {
			const fresult = findYearSession(obj.index, parseFloat(obj.box.split(',')[0]), obj.page, posYear, filteredInterJSON);
			// If a new subject is encountered, reset the subjectObj
			subjectObj = {
				Session: fresult.Session,
				//Session_box: fresult.Session_box,
				Year: fresult.Year,
				//Year_box: fresult.Year_box,
				Subject: obj.word,
				Title: '',
				Credits: '',
				Grade: ''
			};
			creditArray.push(subjectObj);
		} else if (obj.label === 'TITLE') {
			subjectObj.Title = obj.word;
			if (VIEW_MODE) subjectObj.Title_box = obj.page + ":" +obj.box || '';
		} else if (obj.label === 'CREDITS') {
      // Correct data in case decimals are missing of the credit
      let strCredits = obj.word;
			if (strCredits.length === 1) strCredits += ".00";
      if (strCredits.length === 2) strCredits += "00";
      subjectObj.Credits = strCredits;
			if (VIEW_MODE) subjectObj.Credits_box = obj.page + ":" +obj.box || '';
		} else if (obj.label === 'GRADE')
		{
			let strGrade = obj.word;
			//correct OCR mistakes in the grade
			if (obj.word === "aA") {strGrade = "A"}
			if (obj.word === "DR") {strGrade = "D"}
			if (obj.word === "Cc") 	{strGrade = "C"}
			if (obj.word === "M") 	{strGrade = "C"}
			subjectObj.Grade = strGrade;
			if (VIEW_MODE) subjectObj.Grade_box = obj.page + ":" +obj.box || '';
		}
	});

	outputJSON.Credits = creditArray;

	// Calculate the overall confidence score for the document
	outputJSON.Score = calculateConfidenceScore(filteredInterJSON, missingEntityWeights);
}
JSON.stringify(outputJSON);