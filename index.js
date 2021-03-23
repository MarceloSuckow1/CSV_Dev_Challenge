const fs = require("fs");
const PNF = require("google-libphonenumber").PhoneNumberFormat;
const phoneUtil = require("google-libphonenumber").PhoneNumberUtil.getInstance();

FILE_PATH = "./input.csv";

//COLUMN TITLES
NAME_COLUMN_TITLE = "name";
EID_COLUMN_TITLE = "eid";
EMAIL_COLUMN_TITLE = "email";
PHONE_COLUMN_TITLE = "phone";
GROUP_COLUMN_TITLE = "group";
INVISIBLE_COLUMN_TITLE = "invisible";
SEE_ALL_COLUMN_TITLE = "see_all";

//ADDRESS TYPES
EMAIL_TYPE = 0;
PHONE_TYPE = 1;

//Reading the File
fs.readFile(FILE_PATH, "utf8", (err, data) => {
  if (err) {
    return console.log("Error opening file: ", err);
  }

  parseData(data);
});



const writeFile = (data) => {
  fs.writeFile("output.json", data, function (err) {
    if (err) {
      return console.log("Error writing file: ", err);
    }
  });
};



const parseData = (data) => {
  const parsedRows = parseCSV(data);
  const titles = parsedRows.splice(0, 1)[0];

  columnIndexes = getColumnIndexes(titles); //finding the indexes for which column

  //Joining rows of the same student
  const keyMap = {};
  parsedRows.forEach((row) => {
    if (!keyMap[row[columnIndexes.eid]]) {
      keyMap[row[columnIndexes.eid]] = [];
    }
    keyMap[row[columnIndexes.eid]].push(row);
  });

  //converting object to array
  let studentsArray = [];
  for (let key in keyMap) {
    studentsArray.push(keyMap[key]);
  }

  studentsResponseArray = addBasicInformation(studentsArray); //name, eid, see_all, invisible
  studentsResponseArray = addGroups(studentsArray, studentsResponseArray);
  studentsResponseArray = addAddresses(studentsArray,studentsResponseArray,titles);

  writeFile(JSON.stringify(studentsResponseArray, null, 4));
};

const parseCSV = (data) => {
  const lines = data.split("\n");
  const parsedLines = [];

  if (lines) {
    lines.forEach((line) => {
      if (line.length > 0) {
        parsedLine = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/g); //splitting by commas outside quotation marks

        parsedLines.push(
          parsedLine.map((column) => column.replace(/['"]+/g, "")) //removing quotation marks
        );
      }
    });
  } else return;

  return parsedLines;
};

const getColumnIndexes = (titles) => {
  columnIndexes = {
    group: [],
    phone: [],
    email: [],
  };
  titles.forEach((title, index) => {
    if (title.includes(NAME_COLUMN_TITLE)) {
      columnIndexes.name = index;
    }

    if (title.includes(EID_COLUMN_TITLE)) {
      columnIndexes.eid = index;
    }

    if (title.includes(INVISIBLE_COLUMN_TITLE)) {
      columnIndexes.invisible = index;
    }

    if (title.includes(SEE_ALL_COLUMN_TITLE)) {
      columnIndexes.see_all = index;
    }

    if (title.includes(GROUP_COLUMN_TITLE)) {
      columnIndexes.group.push(index);
    }

    if (title.includes(PHONE_COLUMN_TITLE)) {
      columnIndexes.phone.push(index);
    }

    if (title.includes(EMAIL_COLUMN_TITLE)) {
      columnIndexes.email.push(index);
    }
  });
  return columnIndexes;
};

const addBasicInformation = (studentsArray) => {
  //creating an object for each student
  return studentsArray.map((student) => {
    const invisible = student[0][columnIndexes.invisible];
    const see_all = student[0][columnIndexes.see_all];

    return {
      fullname: student[0][columnIndexes.name],
      eid: student[0][columnIndexes.eid],
      invisible: invisible === "1" || invisible === "yes",
      see_all: see_all === "1" || see_all === "yes",
    };
  });
};

const addGroups = (studentsArray, studentsResponseArray) => {
  return studentsArray.map((student, index) => {
    const groupsObject = {};

    student.forEach((row) => {
      columnIndexes.group.forEach((groupIndex) => {
        const group = row[groupIndex];
        if (group.length > 0) {
          const splitGroups = splitValue(group);
          splitGroups.forEach((item) => (groupsObject[item] = item)); //adding unique groups
        }
      });
    });

    //converting to array
    const groupsArray = [];
    for (let key in groupsObject) {
      groupsArray.push(groupsObject[key]);
    }

    return {
      ...studentsResponseArray[index],
      groups: groupsArray,
    };
  });
};

const addAddresses = (studentsArray, studentsResponseArray, titles) => {
  const emailTags = getColumnTags(titles, columnIndexes.email);
  const phoneTags = getColumnTags(titles, columnIndexes.phone);

  return studentsArray.map((student, index) => {
    let addresses = [];

    student.forEach((row) => {
      const emailAddresses = getAddressesObjects(row, emailTags, EMAIL_TYPE);
      const phoneAddresses = getAddressesObjects(row, phoneTags, PHONE_TYPE);

      emailAddresses.forEach((email) => {
        addresses.push(email);
      });

      phoneAddresses.forEach((phone) => {
        addresses.push(phone);
      });
    });

    return {
      ...studentsResponseArray[index],
      addresses: addresses,
    };
  });
};

const getAddressesObjects = (row, tags, type) => {
  const indexes =
    type === EMAIL_TYPE ? columnIndexes.email : columnIndexes.phone;
  const typeString = type === EMAIL_TYPE ? "email" : "phone";

  addressesArray = [];
  indexes.forEach((groupIndex, i) => {
    const address = row[groupIndex];
    if (address.length > 0) {
      const addresses = splitValue(address);

      mappedValues = addresses.map((address) => {

        //validate email  (find pattern -> exclude rest of string/ dont find -> dont add)
        if (type === EMAIL_TYPE) {
          address = extractValidEmail(address);
          if (!address) return null;
          
        } else if (type === PHONE_TYPE) {
          address = address.replace(/\D/g, ""); //keeping only nubers, removing any typos or anomalies
          if (!isPhoneValid(address)) return null;
          address = phoneUtil.format(phoneUtil.parse(address, "BR"),PNF.INTERNATIONAL); //adding country code
          address = address.replace(/\D/g, ""); //formatting removing non-numeric characters
        }

        return {
          type: typeString,
          tags: tags[i],
          address: address,
        };
      });

      mappedValues.forEach((address) => {
        if (address) addressesArray.push(address);
      });
    }
  });
  return addressesArray;
};

const getColumnTags = (titles, indexes) => {
  return indexes.map((index) => {
    tags = titles[index].split(" ");

    //removing words phone or email
    phoneIndex = tags.indexOf("phone");
    emailIndex = tags.indexOf("email");
    if (phoneIndex > -1) tags.splice(phoneIndex, 1);
    if (emailIndex > -1) tags.splice(emailIndex, 1);

    return tags;
  });
};

const splitValue = (string) => {
  string = string.replace(/\s*(,|\/|^|$)\s*/g, "$1"); //removing spaces before and after separators
  return string.split(/,|\//);
};

const isPhoneValid = (phone) => {
  try {
    return phoneUtil.isPossibleNumber(phoneUtil.parse(phone, "BR"));
  } catch (e) {
    return false;
  }
};

function extractValidEmail(string) {
  const regex = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

  const email = string.match(regex);
  if (!email) return null;
  if (email.length > 0) return email[0];
}
