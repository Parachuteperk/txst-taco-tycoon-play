// Catalog merged from docs/design/claude-upgrades.md section 8.6 and section 9.12 blocks A-C.
// src/data/upgrades.json replaces this when the engine publishes it.
// Aaron's overrides are applied in upgrades.js: every signature stays purchasable,
// and ali_ai_ali is the top node of Ali's tree rather than a signature card.

export function mergeUpgradeBlocks(blocks) {
  const crewUpgrades = {};
  const standUpgrades = { main: [], stall: [] };
  const seen = new Set();
  for (const block of blocks || []) {
    for (const [id, rows] of Object.entries(block.crewUpgrades || {})) {
      if (!crewUpgrades[id]) crewUpgrades[id] = [];
      for (const row of rows || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        crewUpgrades[id].push(row);
      }
    }
    for (const stand of ['main', 'stall']) {
      for (const row of block.standUpgrades?.[stand] || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        standUpgrades[stand].push(row);
      }
    }
  }
  return { crewUpgrades, standUpgrades };
}

export function parseUpgradeMarkdown(text) {
  const found = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let match;
  const source = String(text || '');
  while ((match = re.exec(source))) {
    try {
      const json = JSON.parse(match[1]);
      if (json && (json.crewUpgrades || json.standUpgrades)) found.push(json);
    } catch { /* a fenced block that is not catalog JSON */ }
  }
  return found.length ? mergeUpgradeBlocks(found) : null;
}

export const BIBLE_RAW = {
  "crewUpgrades": {
    "jared": [
      {
        "id": "jared_quick_change",
        "tier": 1,
        "name": "Quick Change",
        "cost": 35,
        "requires": [
          "era>=1"
        ],
        "effects": {
          "checkoutSpeed": 0.2
        },
        "visual": "Coin-changer belt on Jared; cash box gets a sorting tray"
      },
      {
        "id": "jared_combo",
        "tier": 2,
        "name": "Make It a Combo",
        "cost": 80,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "skill:jared_quick_change"
        ],
        "effects": {
          "upsellRate": 0.15
        },
        "visual": "COMBO decal on the window; Jared finger-guns on each upsell"
      },
      {
        "id": "jared_tap_to_pay",
        "tier": 3,
        "name": "Tap to Pay",
        "cost": 150,
        "requires": [
          "era>=3",
          "milestone:pitch_day",
          "skill:jared_combo"
        ],
        "effects": {
          "checkoutSpeed": 0.25,
          "tipRate": 0.1
        },
        "visual": "Card reader on the counter blinks green on each tap; Jared switches to a polo"
      },
      {
        "id": "jared_tip_charm",
        "tier": 4,
        "name": "Tip Charm",
        "cost": 225,
        "requires": [
          "era>=4",
          "rep>=4.0",
          "skill:jared_tap_to_pay"
        ],
        "effects": {
          "tipRate": 0.2,
          "checkoutMood": 5
        },
        "visual": "Gold name tag; sparkle on every checkout; tip jar overflows"
      },
      {
        "id": "jared_vault",
        "tier": 5,
        "name": "Gold & Silver Vault",
        "cost": 120,
        "requires": [
          "era>=2",
          "skill:jared_combo"
        ],
        "effects": {
          "vault": 1,
          "vaultMaxAllocation": 0.5,
          "vaultCap": 2000,
          "vaultUpChance": 0.75,
          "goldUp": 0.04,
          "goldDown": -0.07,
          "silverUp": 0.08,
          "silverDown": -0.18,
          "vaultRebalancesPerDay": 1,
          "vaultWithdrawFee": 0.02
        },
        "visual": "Small steel safe under the counter; gold or silver bar icon pulses green or red at day start"
      },
      {
        "id": "jared_coin_flip",
        "tier": 6,
        "name": "Coin Flip",
        "cost": 60,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "skill:jared_quick_change"
        ],
        "effects": {
          "coinFlip": 1,
          "coinFlipOfferRate": 0.02,
          "coinFlipMinMood": 70,
          "coinFlipWinChance": 0.5,
          "coinFlipDailyCap": 3,
          "coinFlipCooldownHours": 1,
          "coinFlipEdgeChance": 0.02,
          "coinFlipEdgeHype": 40,
          "coinFlipLoseMood": 10,
          "coinFlipLoseFriendChance": 0.1,
          "coinFlipVibe": 8
        },
        "visual": "Jared flicks an oversized coin; slow-motion spin with the crowd leaning in"
      }
    ],
    "phillip": [
      {
        "id": "phillip_batch_press",
        "tier": 1,
        "name": "Batch Press",
        "cost": 35,
        "requires": [
          "era>=1"
        ],
        "effects": {
          "prepSpeed": 0.15,
          "batchSize": 1
        },
        "visual": "Wooden tortilla press on his board; tortilla stack grows beside it"
      },
      {
        "id": "phillip_fresh_masa",
        "tier": 2,
        "name": "Fresh Masa",
        "cost": 80,
        "requires": [
          "era>=2",
          "milestone:first_100",
          "skill:phillip_batch_press"
        ],
        "effects": {
          "prepQuality": 8
        },
        "visual": "Masa bowl, flour-dusted apron, steam puffs off each tortilla"
      },
      {
        "id": "phillip_mise_en_place",
        "tier": 3,
        "name": "Mise en Place",
        "cost": 150,
        "requires": [
          "era>=3",
          "rep>=3.5",
          "skill:phillip_fresh_masa"
        ],
        "effects": {
          "prepSpeed": 0.25,
          "prepBuffer": 20,
          "wasteRate": -0.15
        },
        "visual": "Color-coded prep bins line the counter"
      },
      {
        "id": "phillip_comal_master",
        "tier": 4,
        "name": "Comal Master",
        "cost": 225,
        "requires": [
          "era>=3",
          "milestone:clean_kitchen",
          "skill:phillip_mise_en_place"
        ],
        "effects": {
          "batchSize": 2,
          "prepQuality": 7,
          "holdDecay": -0.25
        },
        "visual": "Oversized cast-iron comal; Phillip gets a headband"
      },
      {
        "id": "phillip_tortilla_cannon",
        "tier": 5,
        "name": "Tortilla Cannon",
        "cost": 180,
        "requires": [
          "era>=2",
          "skill:phillip_fresh_masa"
        ],
        "effects": {
          "prepWalkTime": -1,
          "cannonRange": 6,
          "prepSpeed": 0.08,
          "misfireChance": 0.04,
          "misfireMood": -5,
          "misfireJamSeconds": 20
        },
        "visual": "Brass air cannon on Phillip's board; tortillas arc to the next station with a puff"
      },
      {
        "id": "phillip_meal_prep_sunday",
        "tier": 6,
        "name": "Meal Prep Sunday",
        "cost": 140,
        "requires": [
          "era>=2",
          "skill:phillip_batch_press",
          "prop:igloo_cooler"
        ],
        "effects": {
          "mealPrep": 1,
          "mealPrepPortions": 80,
          "mealPrepQuality": 70,
          "mealPrepAssemblySeconds": 2,
          "mealPrepShelfDays": 2,
          "mealPrepCooldownNights": 2,
          "rainSpoilage": 0.4,
          "rainSpoilageAwning": 0.2
        },
        "visual": "Stacked labeled deli containers in the cooler; Phillip yawning at open"
      }
    ],
    "ali": [
      {
        "id": "ali_second_plancha",
        "tier": 1,
        "name": "Second Plancha",
        "cost": 50,
        "requires": [
          "era>=1"
        ],
        "effects": {
          "grillCapacity": 1
        },
        "visual": "Second steel plancha bolted to the griddle"
      },
      {
        "id": "ali_hard_sear",
        "tier": 2,
        "name": "Hard Sear",
        "cost": 90,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "skill:ali_second_plancha"
        ],
        "effects": {
          "grillQuality": 10,
          "grillSpeed": 0.1
        },
        "visual": "Flame flares and heavier sizzle particles"
      },
      {
        "id": "ali_two_zone",
        "tier": 3,
        "name": "Two-Zone Flat-Top",
        "cost": 160,
        "requires": [
          "era>=3",
          "skill:ali_hard_sear"
        ],
        "effects": {
          "grillCapacity": 1,
          "grillSpeed": 0.15
        },
        "visual": "Flat-top glows with a red hot zone and an amber warm zone"
      },
      {
        "id": "ali_ai_ali",
        "tier": 4,
        "name": "AI Ali",
        "cost": 325,
        "requires": [
          "era>=3",
          "rep>=3.5",
          "skill:ali_two_zone"
        ],
        "effects": {
          "westDistraction": -1,
          "grantMultiplier": 0.2,
          "investorScore": 10,
          "westApproval": 15,
          "cloneSuspicionChance": 0.03,
          "cloneSuspicionPerTile": 0.01,
          "cloneSuspicionCap": 0.1,
          "cloneBuyItOdds": 0.6,
          "cloneStartupOdds": 0.3,
          "cloneBustedOdds": 0.1,
          "cloneSeedCheckE3": 400,
          "cloneSeedCheckE4": 600
        },
        "visual": "Identical Ali with a faint blue outline and a tiny BETA sticker, seated on Mrs. West's bench nodding in perfect rhythm"
      },
      {
        "id": "ali_special",
        "tier": 5,
        "name": "The Ali Special",
        "cost": 250,
        "requires": [
          "era>=3",
          "milestone:game_day_hero",
          "skill:ali_two_zone"
        ],
        "effects": {
          "signatureTaco": 1,
          "grillQuality": 5,
          "crowdPull": 0.05,
          "westPullsPerDay": 1
        },
        "visual": "Hand-painted ALI SPECIAL board; Ali in chef whites"
      }
    ],
    "matt": [
      {
        "id": "matt_ticket_caller",
        "tier": 1,
        "name": "Ticket Caller",
        "cost": 35,
        "requires": [
          "era>=2"
        ],
        "effects": {
          "handoffSpeed": 0.2,
          "mixupRate": -0.5
        },
        "visual": "Lanyard ticket clip; called numbers appear in speech bubbles"
      },
      {
        "id": "matt_table_service",
        "tier": 2,
        "name": "Table Service",
        "cost": 80,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "prop:picnic_benches",
          "skill:matt_ticket_caller"
        ],
        "effects": {
          "tableService": 1,
          "seatedPerceivedWait": -0.25,
          "returnRate": 0.1
        },
        "visual": "Serving tray and half apron; visible walks to the benches"
      },
      {
        "id": "matt_save_the_walk",
        "tier": 3,
        "name": "Save the Walk",
        "cost": 150,
        "requires": [
          "era>=3",
          "milestone:community_project",
          "skill:matt_table_service"
        ],
        "effects": {
          "walkoutSave": 0.3
        },
        "visual": "Chip basket on his hip; sprint dust trail"
      },
      {
        "id": "matt_double_tray",
        "tier": 4,
        "name": "Double Tray",
        "cost": 225,
        "requires": [
          "era>=4",
          "rep>=4.0",
          "skill:matt_save_the_walk"
        ],
        "effects": {
          "trayCapacity": 2,
          "handoffSpeed": 0.3,
          "holdDecay": -0.25
        },
        "visual": "A tray in each hand; roller sneakers"
      },
      {
        "id": "matt_hacky_sack",
        "tier": 5,
        "name": "Hacky Sack Circle",
        "cost": 90,
        "requires": [
          "era>=2",
          "skill:matt_ticket_caller"
        ],
        "effects": {
          "hackySack": 1,
          "hackyIdleThresholdSeconds": 3,
          "kickIntervalSeconds": 1.5,
          "kickDropChance": 0.01,
          "hackySulkSeconds": 20,
          "crowdPullPer10Kicks": 0.005,
          "hackyCrowdPullCap": 0.12,
          "hackyJoinStreak": 50,
          "hackyJoinVibe": 5,
          "hackyLegendStreak": 200,
          "hackyLegendHype": 20
        },
        "visual": "Towel over his shoulder, hacky sack bouncing; students form a ring at 50 kicks"
      },
      {
        "id": "matt_grackle_squad",
        "tier": 6,
        "name": "Grackle Squad",
        "cost": 200,
        "requires": [
          "era>=3",
          "skill:matt_table_service"
        ],
        "effects": {
          "grackleSquad": 1,
          "grackleCount": 2,
          "grackleSpeed": 4,
          "grackleRange": 12,
          "grackleEatChance": 0.05,
          "grackleEatMood": -8,
          "grackleEatFunnyChance": 0.3,
          "grackleEatFunnyMood": 5,
          "grackleRestEvery": 10,
          "grackleRestSeconds": 30,
          "grackleCoinChance": 0.005,
          "grackleCoinValue": 5,
          "lawnSeating": 1,
          "shelfTheftWhileAway": -1,
          "grackleSwarmTheftMult": 0.5
        },
        "visual": "Two grackles in tiny maroon vests carry foil-wrapped tacos in their beaks; Matt whistles them in"
      }
    ],
    "aaron": [
      {
        "id": "aaron_line_whisperer",
        "tier": 1,
        "name": "Line Whisperer",
        "cost": 35,
        "requires": [
          "era>=2"
        ],
        "effects": {
          "linePatience": 0.1
        },
        "visual": "Clipboard; he walks the queue chatting"
      },
      {
        "id": "aaron_menu_preview",
        "tier": 2,
        "name": "Menu Preview",
        "cost": 80,
        "requires": [
          "era>=2",
          "skill:aaron_line_whisperer"
        ],
        "effects": {
          "linePatience": 0.1,
          "checkoutSpeed": 0.1
        },
        "visual": "Hands out paper menus; queue snaps into a stanchion rope line"
      },
      {
        "id": "aaron_hype_man",
        "tier": 3,
        "name": "Hype Man",
        "cost": 150,
        "requires": [
          "era>=3",
          "milestone:pitch_day",
          "skill:aaron_menu_preview"
        ],
        "effects": {
          "crowdPull": 0.1,
          "hypeRate": 0.2
        },
        "visual": "Maroon foam finger; passing students wave back"
      },
      {
        "id": "aaron_megaphone",
        "tier": 4,
        "name": "Crowd-Pull Megaphone",
        "cost": 225,
        "requires": [
          "era>=3",
          "rep>=4.0",
          "skill:aaron_hype_man"
        ],
        "effects": {
          "crowdPull": 0.1,
          "tacoCall": 1
        },
        "visual": "Megaphone with sound-wave rings; ambient students turn and walk over"
      },
      {
        "id": "aaron_surge_board",
        "tier": 5,
        "name": "Surge Pricing Board",
        "cost": 220,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "skill:aaron_menu_preview"
        ],
        "effects": {
          "surgePricing": 1,
          "surgeLineBase": 4,
          "surgeLineStep": 0.04,
          "surgeRainMod": -0.1,
          "surgeHeatDrinkMod": 0.05,
          "surgeEventMod": 0.2,
          "surgeMin": 0.85,
          "surgeMax": 1.35,
          "surgeUpdateSeconds": 30,
          "surgeStepCap": 0.05,
          "surgeMoodRelief": 0.5,
          "surgeMoodReliefCeiling": 1.15,
          "gougeThreshold": 1.2,
          "gougeGraceHours": 1,
          "gougeRepPerHour": -0.1,
          "gougeWalkoutShare": 0.1
        },
        "visual": "Flip-digit price board over the window; Aaron taps it from his clipboard as the numbers roll"
      },
      {
        "id": "aaron_franchise_deal",
        "tier": 6,
        "name": "Franchise Deal",
        "cost": 600,
        "requires": [
          "era>=4",
          "rep>=4.3",
          "skill:aaron_surge_board",
          "skill:aaron_hype_man"
        ],
        "effects": {
          "franchiseDeal": 1,
          "franchiseMax": 3,
          "franchiseOpenIntervalDays": 1,
          "franchiseRoyaltyRate": 0.08,
          "franchiseRoyaltyRepPivot": 4.5,
          "scandalChancePerDay": 0.05,
          "scandalHighRepThreshold": 4.5,
          "scandalHighRepMult": 0.5,
          "scandalRep": -0.15,
          "scandalPauseDays": 2
        },
        "visual": "Map board with pins for three campuses; Aaron's clipboard grows to poster size"
      }
    ],
    "antonio": [
      {
        "id": "antonio_ring_light",
        "tier": 1,
        "name": "Ring Light",
        "cost": 40,
        "requires": [
          "era>=1"
        ],
        "effects": {
          "crowdPull": 0.05,
          "hypeRate": 0.2
        },
        "visual": "Ring light clipped to his laptop"
      },
      {
        "id": "antonio_taco_cam",
        "tier": 2,
        "name": "Taco Cam",
        "cost": 90,
        "requires": [
          "era>=2",
          "rep>=3.0",
          "skill:antonio_ring_light"
        ],
        "effects": {
          "viralChance": 0.05,
          "vibe": 5
        },
        "visual": "Tripod camera aimed at the grill; LIVE sign blinks"
      },
      {
        "id": "antonio_clip_farmer",
        "tier": 3,
        "name": "Clip Farmer",
        "cost": 160,
        "requires": [
          "era>=3",
          "milestone:community_project",
          "skill:antonio_taco_cam"
        ],
        "effects": {
          "viralChance": 0.1,
          "viralDuration": 0.5
        },
        "visual": "Second monitor with scrolling chat; a clip counter ticks up"
      },
      {
        "id": "antonio_preorder_hack",
        "tier": 4,
        "name": "Pre-Order App Hack",
        "cost": 250,
        "requires": [
          "era>=3",
          "rep>=4.0",
          "skill:antonio_clip_farmer"
        ],
        "effects": {
          "preorderShare": 0.2
        },
        "visual": "QR overlay on the stream; phone-ping icons over customers who skip the line"
      },
      {
        "id": "antonio_twitch_raid",
        "tier": 5,
        "name": "Twitch Raid",
        "cost": 160,
        "requires": [
          "era>=2",
          "skill:antonio_taco_cam"
        ],
        "effects": {
          "streamRaid": 1,
          "raidLandChance": 0.7,
          "raidSizeMin": 40,
          "raidSizeMax": 60,
          "raidWindowHours": 1,
          "raidOrderSize": 1.2,
          "raidPriceSensitivity": -0.3,
          "raidHype": 30,
          "raidCooldownDays": 2,
          "raidRatioWalkout": 0.4,
          "raidRatioRep": -0.2
        },
        "visual": "Purple confetti burst from the rig; raiders arrive wearing headsets"
      },
      {
        "id": "antonio_crypto_rig",
        "tier": 6,
        "name": "Crypto Mining Rig",
        "cost": 350,
        "requires": [
          "era>=3",
          "prop:antonio_pro_rig",
          "skill:antonio_ring_light"
        ],
        "effects": {
          "cryptoRig": 1,
          "cryptoYieldPerHour": 10,
          "cryptoYieldMin": 0.4,
          "cryptoYieldMax": 1.6,
          "overheatChancePerHour": 0.03,
          "overheatHeatWaveMult": 2,
          "overheatFanMult": 0.5,
          "overheatStallSeconds": 30
        },
        "visual": "Glowing GPU tower with spinning fans beside the rig; red smoke puff and breaker spark on overheat"
      }
    ],
    "west": [
      {
        "id": "west_office_hours",
        "tier": 1,
        "name": "Office Hours",
        "cost": 50,
        "requires": [
          "era>=1"
        ],
        "effects": {
          "loanRate": -0.05,
          "loanCap": 300
        },
        "visual": "She appears on a bench with coffee and a laptop"
      },
      {
        "id": "west_investor_checkpoint",
        "tier": 2,
        "name": "Investor Checkpoint",
        "cost": 100,
        "requires": [
          "era>=2",
          "milestone:pitch_day",
          "skill:west_office_hours"
        ],
        "effects": {
          "grantMultiplier": 0.25,
          "extraCheckpoint": 1
        },
        "visual": "Briefcase; whiteboard with a hand-drawn growth chart beside the stand"
      },
      {
        "id": "west_business_school",
        "tier": 3,
        "name": "Business School Multiplier",
        "cost": 175,
        "requires": [
          "era>=3",
          "rep>=3.5",
          "skill:west_investor_checkpoint"
        ],
        "effects": {
          "skillMultiplier": 0.1
        },
        "visual": "SIFE banner on the stand; crew wear matching lanyards"
      },
      {
        "id": "west_ali_fund",
        "tier": 4,
        "name": "The Ali Fund",
        "cost": 250,
        "requires": [
          "era>=4",
          "skill:ali_special",
          "skill:west_business_school"
        ],
        "effects": {
          "loanRate": -0.05,
          "stipend": 60,
          "signaturePriceTolerance": 0.1
        },
        "visual": "Easel by the grill holds her 'ALI: A Thesis' pitch deck; she takes notes on every flip"
      },
      {
        "id": "west_angel_round",
        "tier": 5,
        "name": "Angel Round",
        "cost": 75,
        "requires": [
          "era>=2",
          "milestone:pitch_day",
          "skill:west_office_hours"
        ],
        "effects": {
          "angelRound": 1,
          "angelCashE2": 600,
          "angelShareE2": 0.1,
          "angelCashE3": 1200,
          "angelShareE3": 0.15,
          "angelRoundsPerRun": 1
        },
        "visual": "Napkin term sheet pinned to the stand; a 'Backed by West' sticker on the cash box"
      },
      {
        "id": "west_designer_popup",
        "tier": 6,
        "name": "Designer Pop-Up",
        "cost": 250,
        "requires": [
          "era>=3",
          "rep>=4.0",
          "skill:west_investor_checkpoint"
        ],
        "effects": {
          "designerPopUp": 1,
          "popUpPriceMult": 3,
          "popUpArrivalMult": 0.45,
          "popUpFairPriceMult": 2.6,
          "popUpGarnishCost": 1,
          "popUpQualityFloor": 70,
          "popUpVibeFloor": 60,
          "popUpLowVibeArrivalMult": 0.3,
          "popUpBacklashRep": -0.3,
          "popUpCooldownDays": 4
        },
        "visual": "Black tablecloth, slate plates, velvet rope; Phillip and Ali in black aprons"
      },
      {
        "id": "west_hostile_takeover",
        "tier": 7,
        "name": "Hostile Takeover",
        "cost": 150,
        "requires": [
          "era>=3",
          "rep>=4.0",
          "skill:west_business_school"
        ],
        "effects": {
          "hostileTakeover": 1,
          "takeoverPrice": 1800,
          "takeoverBaseOdds": 0.8,
          "takeoverOddsPerTenthStar": 0.05,
          "takeoverOddsCap": 0.95,
          "takeoverFailFee": 450,
          "takeoverFailExtraDays": 2,
          "takeoverFailUndercut": 0.25,
          "takeoverWinArrivals": 0.05
        },
        "visual": "Mrs. West strides to Big Kyle's truck with a briefcase; a contract signing animation"
      }
    ]
  },
  "standUpgrades": {
    "main": [
      {
        "id": "main_awning",
        "tier": 1,
        "name": "Order Window Awning",
        "cost": 150,
        "requires": [
          "era>=3"
        ],
        "effects": {
          "linePatience": 0.05,
          "weatherShield": 0.1,
          "vibe": 5
        },
        "visual": "Maroon-and-gold striped awning over the window"
      },
      {
        "id": "main_steam_pass",
        "tier": 2,
        "name": "Steam-Table Pass",
        "cost": 250,
        "requires": [
          "era>=3"
        ],
        "effects": {
          "holdDecay": -0.4,
          "handoffSpeed": 0.1
        },
        "visual": "Stainless pass with a heat shimmer"
      },
      {
        "id": "main_neon_sign",
        "tier": 3,
        "name": "Neon Taco Sign",
        "cost": 300,
        "requires": [
          "era>=3",
          "rep>=3.5"
        ],
        "effects": {
          "crowdPull": 0.1,
          "duskVibe": 10
        },
        "visual": "Neon sign flickers on at 16:00"
      },
      {
        "id": "main_truck_generator",
        "tier": 4,
        "name": "Truck Generator",
        "cost": 400,
        "requires": [
          "era>=4"
        ],
        "effects": {
          "relocateTime": -0.5,
          "truckGrillCapacity": 1
        },
        "visual": "Generator box on the hitch; exhaust puff on startup"
      },
      {
        "id": "main_truck_wrap",
        "tier": 5,
        "name": "Truck Wrap",
        "cost": 350,
        "requires": [
          "era>=4",
          "rep>=4.0"
        ],
        "effects": {
          "truckCrowdPull": 0.1,
          "viralChance": 0.03
        },
        "visual": "Full vinyl wrap with crew caricatures"
      },
      {
        "id": "main_walk_in",
        "tier": 6,
        "name": "Commissary Walk-In",
        "cost": 450,
        "requires": [
          "era>=4"
        ],
        "effects": {
          "storageCap": 8,
          "restockSpeed": 0.5,
          "spoilageRate": -0.3
        },
        "visual": "Walk-in cooler door behind the stand; frost puff when opened"
      }
    ],
    "stall": [
      {
        "id": "stall_open_drinks",
        "tier": 0,
        "name": "Open: Drinks Bar",
        "cost": 600,
        "requires": [
          "era>=4",
          "stall:none"
        ],
        "effects": {
          "stallOpen": 1
        },
        "visual": "Stall with a horchata and agua fresca dispenser row"
      },
      {
        "id": "stall_open_churros",
        "tier": 0,
        "name": "Open: Churro Cart",
        "cost": 600,
        "requires": [
          "era>=4",
          "stall:none"
        ],
        "effects": {
          "stallOpen": 1
        },
        "visual": "Stall with a fryer and cinnamon-sugar tray"
      },
      {
        "id": "stall_open_breakfast",
        "tier": 0,
        "name": "Open: Breakfast Taco Stall",
        "cost": 600,
        "requires": [
          "era>=4",
          "stall:none"
        ],
        "effects": {
          "stallOpen": 1
        },
        "visual": "Stall with a foil-wrapped hot-hold box"
      },
      {
        "id": "stall_equipment_2",
        "tier": 1,
        "name": "Equipment II",
        "cost": 150,
        "requires": [
          "stall:open"
        ],
        "effects": {
          "stallCapacity": 1
        },
        "visual": "Second dispenser, fryer basket, or hot-hold appears on the counter"
      },
      {
        "id": "stall_sidewalk_sign",
        "tier": 2,
        "name": "Sidewalk Sign",
        "cost": 80,
        "requires": [
          "stall:open"
        ],
        "effects": {
          "stallCrowdPull": 0.1
        },
        "visual": "A-frame chalk sign with art matching the specialty"
      },
      {
        "id": "stall_cross_sell",
        "tier": 3,
        "name": "Cross-Sell Coupons",
        "cost": 150,
        "requires": [
          "stall:open"
        ],
        "effects": {
          "crossSell": 0.15
        },
        "visual": "Coupon slips flutter from both windows"
      },
      {
        "id": "stall_second_window",
        "tier": 4,
        "name": "Second Window",
        "cost": 250,
        "requires": [
          "stall:open"
        ],
        "effects": {
          "checkoutSpeed": 0.3,
          "stallStaffMax": 1
        },
        "visual": "Second service hatch cut into the stall"
      },
      {
        "id": "stall_agua_flight",
        "tier": 5,
        "name": "Agua Fresca Flight",
        "cost": 300,
        "requires": [
          "stallSpecialty:drinks",
          "rep>=4.0"
        ],
        "effects": {
          "stallPrice": 1,
          "crossSell": 0.1
        },
        "visual": "Glass dispenser row in three colors"
      },
      {
        "id": "stall_churro_sundae",
        "tier": 5,
        "name": "Churro Sundae",
        "cost": 300,
        "requires": [
          "stallSpecialty:churros",
          "rep>=4.0"
        ],
        "effects": {
          "stallPrice": 1.5,
          "vibe": 8
        },
        "visual": "Soft-serve machine; customers carry cones"
      },
      {
        "id": "stall_predawn_shift",
        "tier": 5,
        "name": "Pre-Dawn Shift",
        "cost": 300,
        "requires": [
          "stallSpecialty:breakfast",
          "rep>=4.0"
        ],
        "effects": {
          "openHours": 2,
          "stallCrowdPull": 0.1
        },
        "visual": "Lantern on the stall; early-light tint over the stall tiles"
      },
      {
        "id": "stall_open_takeover",
        "tier": 0,
        "name": "Open: Big Kyle's Former Truck",
        "cost": 0,
        "requires": [
          "flag:takeover_won",
          "stall:none"
        ],
        "effects": {
          "stallOpen": 1
        },
        "visual": "Kyle's truck repainted maroon with UNDER NEW MANAGEMENT taped over the old logo"
      }
    ]
  }
};
