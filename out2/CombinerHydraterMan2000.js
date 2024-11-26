const https = require('https');
const fs = require('fs');

// URLs for WikiScrape and LeagueScrape data
const wikiScrapeUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/tasks/LEAGUE_4.min.json';
const leagueScrapeUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/json/min/league4_tasks.min.json';

// Utility to map skill names to proper casing
const skillMap = {
  CRAFTING: 'Crafting',
  // Add other skills as needed
};

// Difficulty and category mappings
const DIFFICULTY = {
  EASY: 'DIFFICULTY.EASY',
  MEDIUM: 'DIFFICULTY.MEDIUM',
  HARD: 'DIFFICULTY.HARD',
  ELITE: 'DIFFICULTY.ELITE',
  MASTER: 'DIFFICULTY.MASTER',
};

const CATEGORY = {
  SKILLING: {
    name: 'CATEGORY.SKILLING',
    subcategories: {
      CRAFTING: 'CATEGORY.SKILLING.subcategories.CRAFTING',
      // Add more subcategories TODO
    },
  },
  // Add other categories if TODO
};

// Fetch JSON data from a given URL
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      // Collect data chunks
      res.on('data', (chunk) => {
        data += chunk;
      });

      // Once all data is received
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (err) {
          reject(`Error parsing JSON from ${url}: ${err.message}`);
        }
      });
    }).on('error', (err) => {
      reject(`Error fetching URL ${url}: ${err.message}`);
    });
  });
}

// Main function to fetch and combine data
async function main() {
  try {
    console.log('Fetching data...');
    const [wikiData, leaguesData] = await Promise.all([
      fetchJson(wikiScrapeUrl),
      fetchJson(leagueScrapeUrl),
    ]);

    console.log('Data fetched successfully. Combining...');

    // Combine the data
    const finalOutput = {};

    leaguesData.forEach((leagueTask) => {
      const wikiEntry = wikiData.find((wiki) => wiki.structId === leagueTask.lookupstruct);

      if (!wikiEntry) {
        console.warn(`No matching wiki entry found for structId: ${leagueTask.lookupstruct}`);
        return;
      }

      // Safely handle the case where `skills` might be undefined
      const skillReqs = Array.isArray(wikiEntry.skills)
        ? wikiEntry.skills.map((skill) => ({
            skill: skillMap[skill.skill] || skill.skill, // Map skill names to proper casing
            level: parseInt(skill.level, 10),
          }))
        : []; // Default to an empty array if `skills` is not defined

      // Add to final output
      finalOutput[leagueTask.id] = {
        id: leagueTask.id,
        label: leagueTask.name,
        description: leagueTask.description,
        skillReqs: skillReqs,
        regions: [leagueTask.area || 'General'],
        difficulty: DIFFICULTY[leagueTask.tier.toUpperCase()] || 'DIFFICULTY.UNKNOWN',
        category: CATEGORY.SKILLING.name,
        subcategory: CATEGORY.SKILLING.subcategories.CRAFTING, // Adjust based on your logic
        prerequisite: '', // Adjust if you have prerequisite data
      };
    });

    // Write the output to a new JSON file
    fs.writeFileSync('finalOutput.json', JSON.stringify(finalOutput, null, 2), 'utf8');
    console.log('Combined data written to finalOutput.json');
  } catch (err) {
    console.error('Error:', err);
  }
}

// Execute the script
main();
