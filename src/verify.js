// Methods that are used to verify and fix any data issues before pushing.
const _ = require('lodash')

// Verification of the daily summary.
//
// @throws ValidationError if the data is not correct.
// @returns valid dailySummary.
const verifyDailySummary = (dailySummary) => {
  // Ensure there's some data.
  if (dailySummary.length < 10) {
    throw `ValidationError: Expecting more than 10 days of data.`
  }

  // Ensure none of the fields are zero.
  let latestDay = dailySummary[dailySummary.length - 1]
  for (let key in _.keys(latestDay)) {
    if (key.endsWith('Cumulative')) {
      if (latestDay[key] < 1) {
        throw `ValidationError: ${key} for the latest day is 0.`
      }
    }
  }

  return dailySummary
}

const verifyPatients = (patients) => {
  // Ensure there are no duplicate patient Ids.
  let patientIds = {}
  let duplicates = []
  for (let patient of patients) {
    if (patient.patientId == -1) {
      continue
    }
    if (patientIds[patient.patientId]) {
      duplicates.push(patient.patientId)
    }
    patientIds[patient.patientId] = 1
  }

  if (duplicates.length > 0) {
    throw `ValidationError: Duplicated patientIds detected ${duplicates}`
  }



  return patients
}

exports.verifyDailySummary = verifyDailySummary
exports.verifyPatients = verifyPatients
