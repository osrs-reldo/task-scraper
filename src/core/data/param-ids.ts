import { ParamID } from '@abextm/cache2';

export class PARAM_ID {
  // Leagues
  static LEAGUE_VARBIT_INDEX: ParamID = 873 as ParamID;
  static LEAGUE_NAME: ParamID = 874 as ParamID;
  static LEAGUE_DESCRIPTION: ParamID = 875 as ParamID;
  static LEAGUE_TIER_ID: ParamID = 1852 as ParamID;
  static LEAGUE_CATEGORY_ID: ParamID = 1016 as ParamID; // Leagues IV category
  static LEAGUE_AREA_ID: ParamID = 1017 as ParamID;

  // Combat achievements
  static CA_VARBIT_INDEX: ParamID = 1307 as ParamID;
  static CA_NAME: ParamID = 1308 as ParamID;
  static CA_DESCRIPTION: ParamID = 1309 as ParamID;
  static CA_MONSTER_ID: ParamID = 1312 as ParamID;
  static CA_TIER_ID: ParamID = 1310 as ParamID;
  static CA_CATEGORY_ID: ParamID = 1311 as ParamID; // Combat Achievements category
}
