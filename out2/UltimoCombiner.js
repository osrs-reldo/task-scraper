const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function extractCategories() {
    const categoriesUrl = 'https://raw.githubusercontent.com/osrs-reldo/os-league-tools/refs/heads/master/src/data/categories.js';
    const outputFile = path.join(__dirname, 'categories.json');

    try {
        // Fetch the categories.js file
        let categoriesScript = (await axios.get(categoriesUrl)).data;

        // Use regex to find only the CATEGORY constant definition
        const match = categoriesScript.match(/const CATEGORY\s*=\s*({[\s\S]*?});/);
        if (!match) {
            throw new Error('CATEGORY constant not found in categories.js');
        }

        // Extract the CATEGORY script portion
        const categoryScript = match[1];

        // Stub out `images` and other undefined variables
        const sandbox = {
            images: {}, // Stub `images` as an empty object
        };

        // Safely evaluate the CATEGORY object
        const CATEGORY = eval(`
            with (sandbox) {
                (${categoryScript})
            }
        `);

        // Write the CATEGORY object to a JSON file
        fs.writeFileSync(outputFile, JSON.stringify(CATEGORY, null, 2));
        console.log(`CATEGORY object extracted and saved to ${outputFile}`);
    } catch (error) {
        console.error('Error extracting CATEGORY object:', error.message);
    }
}

async function fetchAndFormatData() {
    const tasksUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/tasks/LEAGUE_4.min.json';
    const localFile = path.join(__dirname, 'leagues_4.json');
    const categoriesFile = path.join(__dirname, 'categories.json');
    const wikiScrapeUrl = 'https://raw.githubusercontent.com/osrs-reldo/task-json-store/refs/heads/main/tasks/LEAGUE_4.min.json';

    try {
        // Fetch tasks JSON data
        const tasksResponse = await axios.get(tasksUrl);
        const remoteData = tasksResponse.data;

        // Fetch wiki scrape data
        const wikiScrapeResponse = await axios.get(wikiScrapeUrl);
        const wikiScrapeData = wikiScrapeResponse.data;

        // Read leagues_4.json
        const localData = JSON.parse(fs.readFileSync(localFile, 'utf-8'));

        // Read preprocessed categories.json
        const CATEGORY = JSON.parse(fs.readFileSync(categoriesFile, 'utf-8'));

        // Combine and format data
        const combinedData = {};

        localData.forEach(localItem => {
            const remoteItem = remoteData.find(remote => remote.structId === localItem.lookupstruct);
            const wikiItem = wikiScrapeData.find(wiki => wiki.structId === localItem.lookupstruct);

            if (remoteItem) {
                // Format the object based on the previous years file.
                const categoryKey = localItem.category.toUpperCase();
                const category = CATEGORY[categoryKey];
                const subcategory = category?.subcategories?.GENERAL || 'Unknown';

                combinedData[localItem.id] = {
                    id: localItem.id,
                    label: localItem.name, 
                    description: localItem.description,
                    skillReqs: wikiItem?.skills?.map(skill => ({
                        skill: skill.skill.toLowerCase(),
                        level: parseInt(skill.level, 10)
                    })) || [], // Map skills to lowercase skill names and integer levels
                    regions: [localItem.area],
                    difficulty: localItem.tier,
                    category: categoryKey,
                    subcategory: subcategory,
                    prerequisite: '', // Seemingly "dead" field ish. 
                };
            }
        });

        // Write the formatted data to a new file
        const outputFilePath = path.join(__dirname, 'formatted_leagues_4.json');
        fs.writeFileSync(outputFilePath, JSON.stringify(combinedData, null, 2));

        console.log('Formatted data written to:', outputFilePath);
    } catch (error) {
        console.error('Error during processing:', error.message);
    }
}

(async function main() {
    try {
        await extractCategories();
        await fetchAndFormatData();
    } catch (error) {
        console.error('Script failed:', error.message);
    }
})();
