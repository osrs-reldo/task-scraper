Node v22.4.0 required

To generate League tasks and Combat Tasks, with the above Node version installed run;

npm run cli tasks combat -- --legacy --json

npm run cli tasks leagues4 -- --legacy --json

Ensuring you have an "out" directory alongside /src/ this will generate 2 corresponding .JSONs for use. 

Examples below;


{
    "id": "1622",
    "name": "Equip a Corrupted Bow of Faerdhinen",
    "description": "Obtain and Equip a Corrupted Bow of Faerdhinen.",
    "category": "Combat",
    "tier": "Master",
    "clientSortId": "1471"
  },



  {
    "structId": 3453,
    "sortId": 393,
    "id": "3594",
    "monster": "12",
    "name": "Undying Raider",
    "description": "Complete a Chambers of Xeric solo raid without dying.",
    "category": "Combat",
    "tier": "Master",
    "clientSortId": "393"
  },