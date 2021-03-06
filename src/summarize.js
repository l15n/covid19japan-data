// Summarizes data for site.
const _ = require('lodash')
const moment = require('moment')

const verify = require('./verify.js')

// Merge all the data from the spreadsheet with auto-calculation
//
// patientData: Output generated by fetchPatientData
// manualDailyData: List of rows from the Sum By Day spreadsheet.
// manualPrefectureData: List of rows from the Prefecture Data spreadsheet
// lastUpdated: String representing when the data was last updated.
//
// @returns A dictionary with the prefecture and daily summaries.
const summarize = (patientData, manualDailyData, manualPrefectureData, lastUpdated) => {
  const patients = _.orderBy(patientData, ['dateAnnounced'], ['asc'])
  let prefectureSummary = generatePrefectureSummary(patients, manualPrefectureData)
  let dailySummary = generateDailySummary(patients, manualDailyData)

  return {
    prefectures: prefectureSummary,
    daily: dailySummary,
    updated: lastUpdated
  }
}


// Helper method to do parseInt safely (reverts to 0 if unparse)
const safeParseInt = v => {
  let result = parseInt(v)
  if (isNaN(result)) {
    return 0
  }
  return result
}

// Generates the daily summary
const generateDailySummary = (patients, manualDailyData) => {
  let dailySummary = {}
  for (let patient of patients) {
    let dateAnnounced = patient.dateAnnounced
    if (!patient.dateAnnounced) {
      continue
    }
    if (!dailySummary[dateAnnounced]) {
      dailySummary[dateAnnounced] = {
        confirmed: 0,
        recoveredCumulative: 0,
        deceasedCumulative: 0,
        criticalCumulative: 0,
        testedCumulative: 0
      }
    }

    if (patient.confirmedPatient) {
      dailySummary[dateAnnounced].confirmed += 1
    }
  }

  // merge manually sourced data
  // TODO: deceased, critical should be pulled out of our patient
  //       data. But those numbers are incomplete.
  for (let row of manualDailyData) {
    if (dailySummary[row.date]) {
      dailySummary[row.date].recoveredCumulative = safeParseInt(row.recovered)
      dailySummary[row.date].deceasedCumulative = safeParseInt(row.deceased)
      dailySummary[row.date].criticalCumulative = safeParseInt(row.critical)
      dailySummary[row.date].testedCumulative = safeParseInt(row.tested)
    }
  }

  let orderedDailySummary = 
      _.map(_.sortBy(_.toPairs(dailySummary), a => a[0]), (v) => { let o = v[1]; o.date = v[0]; return o })
  
  // Calculate the confirmedCumulative by iterating through all the days in order
  let confirmedCumulative = 0
  for (let dailySum of orderedDailySummary) {
    confirmedCumulative += dailySum.confirmed
    dailySum.confirmedCumulative = confirmedCumulative
  }

  // Calculate a rolling 3/7 day average for confirmed.
  let threeDayBuffer = []
  let sevenDayBuffer = []
  let confirmedCumulativeAvg3d = 0
  let confirmedCumulativeAvg7d = 0
  for (let dailySum of orderedDailySummary) {
    threeDayBuffer.push(dailySum.confirmed)
    sevenDayBuffer.push(dailySum.confirmed)
    if (threeDayBuffer.length > 3) {
      threeDayBuffer = threeDayBuffer.slice(threeDayBuffer.length - 3)
    }
    if (sevenDayBuffer.length > 7) {
      sevenDayBuffer = sevenDayBuffer.slice(sevenDayBuffer.length - 7) 
    }
    dailySum.confirmedAvg3d = Math.floor(_.sum(threeDayBuffer) / 3)
    confirmedCumulativeAvg3d += dailySum.confirmedAvg3d
    dailySum.confirmedCumulativeAvg3d = confirmedCumulativeAvg3d

    dailySum.confirmedAvg7d = Math.floor(_.sum(sevenDayBuffer) / 7)
    confirmedCumulativeAvg7d += dailySum.confirmedAvg7d
    dailySum.confirmedCumulativeAvg7d = confirmedCumulativeAvg7d
  }
  
  // For dates we don't have any manually entered data, pass those forward.
  for (let i = 1; i < orderedDailySummary.length; i++) {
    let thisDay = orderedDailySummary[i]
    let previousDay = orderedDailySummary[i-1]
    if (thisDay.recoveredCumulative == 0) {
      thisDay.recoveredCumulative = previousDay.recoveredCumulative
    }
    if (thisDay.deceasedCumulative == 0) {
      thisDay.deceasedCumulative = previousDay.deceasedCumulative
    }
    if (thisDay.criticalCumulative == 0) {
      thisDay.criticalCumulative = previousDay.criticalCumulative
    }
    if (thisDay.testedCumulative == 0) {
      thisDay.testedCumulative = previousDay.testedCumulative
    }
  }

  orderedDailySummary = verify.verifyDailySummary(orderedDailySummary)
  return orderedDailySummary
}


// Generate the per-prefecture summary, ordered by number of confirmed cases.
//
// patients: Patients data from Patient Data spreadsheet.
// manualPrefectureData: List of rows from the prefecture spreadsheet.
//
// @returns prefectureSummary as a dictionary.
const generatePrefectureSummary = (patients, manualPrefectureData) => {
  let prefectureSummary = {}

  for (let patient of patients) {
    let prefectureName = patient.detectedPrefecture
    let cityName = patient.detectedCityTown

    if (!prefectureSummary[prefectureName]) {
      prefectureSummary[prefectureName] = {
        confirmed: 0,
        cruisePassenger: 0,
        cruiseWorker: 0,
        deaths: 0,
        patients: [],
        confirmedByCity: {}
      }
    }

    if (patient.confirmedPatient) {
      prefectureSummary[prefectureName].confirmed += 1
      if (cityName) {
        if (prefectureSummary[prefectureName].confirmedByCity[cityName]) {
          prefectureSummary[prefectureName].confirmedByCity[cityName] += 1
        } else {
          prefectureSummary[prefectureName].confirmedByCity[cityName] = 1        
        }
      }

      if (patient.cruisePassengerDisembarked == 1) {
        prefectureSummary[prefectureName].cruisePassenger += 1
      }
      if (patient.cruiseQuarantineOfficer == 1) {
        prefectureSummary[prefectureName].cruiseWorker += 1
      }
    }

    if (patient.patientStatus == 'Deceased') {
      prefectureSummary[prefectureName].deaths += 1
    }

    prefectureSummary[prefectureName].patients.push(patient)
  }

  for (let prefectureName of _.keys(prefectureSummary)) {
    let prefecture = prefectureSummary[prefectureName]
    const firstDay = moment('2020-01-08')
    const dailyConfirmed = generateDailyStatsForPrefecture(prefecture.patients, firstDay)
    if (dailyConfirmed && dailyConfirmed.length) {
      prefecture.dailyConfirmedCount = dailyConfirmed
      prefecture.dailyConfirmedStartDate = firstDay.format('YYYY-MM-DD')
      prefecture.newlyConfirmed = dailyConfirmed[dailyConfirmed.length - 1]
    }
  }

  // Import manual data.
  for (let row of manualPrefectureData) {
    if (prefectureSummary[row.prefecture]) {
      prefectureSummary[row.prefecture].recovered = safeParseInt(row.recovered)
      prefectureSummary[row.prefecture].deaths = safeParseInt(row.deaths)
      prefectureSummary[row.prefecture].name_ja = row.prefectureJa
    }
  }

  // Strip out patients list
  prefectureSummary = _.mapValues(prefectureSummary, (v, k) => { 
    delete v['patients']
    return v
  })

  return _.map(
    _.reverse(
      _.sortBy(
        _.toPairs(prefectureSummary), 
        [ a => a[1].confirmed ])),
    (v) => { let o = v[1]; o.name = v[0]; return o }
  )
}

const generateDailyStatsForPrefecture = (patients, firstDay) => {
  const lastDay = moment().utcOffset(540)
  let day = moment(firstDay)
  let daily = []
  while (day <= lastDay) {
    let dayString = day.format('YYYY-MM-DD')
    let reports = _.filter(patients, o => { return o.dateAnnounced == dayString && o.confirmedPatient})
    daily.push(reports.length)
    day = day.add(1, 'days')
  }
  return daily
}

exports.summarize = summarize;

