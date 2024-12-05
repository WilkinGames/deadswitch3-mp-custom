/**
 * Deadswitch 3 Multiplayer Server
 * (c) 2022 Wilkin Games
 * https://xwilkinx.com
 */

const chalk = require("chalk");
const log = console.log;
const serverSettings = require("./settings.json");
const gameInstance = require("./assets/js/game");
const auth = require("./auth.json");

//Track emits
setInterval(function ()
{
    stats.emitsPerSecond = stats.emits;
    stats.emits = 0;
}, 1000);

//Rate limiters
const { RateLimiterMemory } = require("rate-limiter-flexible");
const rateLimiter = new RateLimiterMemory({
    points: 300,
    duration: 1
});
const gameLimiter = new RateLimiterMemory({
    points: 60,
    duration: 1
});
const actionLimiter = new RateLimiterMemory({
    points: 2,
    duration: 1
});
const chatLimiter = new RateLimiterMemory({
    points: 5,
    duration: 5
});

//Math
var MathUtil = {
    Random: function (_min, _max)
    {
        return Math.floor(Math.random() * (_max - _min + 1)) + _min;
    },
    RandomBoolean: function()
    {
        return Math.random() >= 0.5;
    }
};

//Server data
const Server = {
    VERSION: "1.2.0",
    GAME_VERSION: "1.6.8",
    OFFICIAL: true
};
const GameData = {
    FACTION_DELTA_FORCE: "usmc",
    FACTION_GSG9: "gsg9",
    FACTION_GIGN: "gign",
    FACTION_OPFOR: "opfor",
    FACTION_SPETSNAZ: "rus",
    FACTION_MILITIA: "militia",
    BOT_SKILL_AUTO: -1,
    BOT_SKILL_EASY: 0,
    BOT_SKILL_NORMAL: 1,
    BOT_SKILL_HARD: 2,
    BOT_SKILL_INSANE: 3,
    BOT_SKILL_GOD: 4,
    MAX_LEVEL: 50,
    MAX_PRESTIGE: 10
};
var lobbies = {};
var lobbyTimers = {};
var parties = {};
var intervals = {};
var stats = {
    playersConnected: 0,
    gamesPlayed: 0,  
    peakGamesInProgress: 0,
    peakPlayersConnected: 0,
    emits: 0,
    emitsPerSecond: 0
};
var chatHistory = [];

log(chalk.bgBlue("Deadswitch 3 Multiplayer Server v" + Server.VERSION));
var serverStartTime = Date.now();
log("Started:", (new Date(serverStartTime).toString()));
log(serverSettings, "\n");

//Load all modules
log(chalk.yellow("Loading modules..."));
var smile = require("smile2emoji");
var express = require("express");
var app = express();
var server = require("http").Server(app);
var io = require("socket.io").listen(server, { pingInterval: serverSettings.pingInterval, pingTimeout: serverSettings.pingTimeout });
io.set("transports", ["websocket"]);
io.origins("*:*");

const shared = require("./assets/json/shared.json");
const sprites = require("./assets/json/sprites.json");
const atlas_weapons_world = require("./assets/images/world/atlas_weapons_world.json");
const weapons = require("./assets/json/weapons.json");
const mods = require("./assets/json/mods.json");
const perks = require("./assets/json/perks.json");
const killstreaks = require("./assets/json/killstreaks.json");
const game_modes = require("./assets/json/modes.json");
const botnames = require("./assets/json/botnames.json");
const bots = require("./assets/json/bots.json");
const titlecards_soldiers = require("./assets/json/titlecards_soldiers.json");
const badwords = require("./assets/json/badwords.json");

const maps = require("./assets/json/maps.json");
var allMaps = [];
for (var i = 0; i < maps.length; i++)
{
    let id = maps[i].id;
    try
    {
        allMaps.push(require("./assets/json/maps/" + id + ".json"));
    }
    catch (e)
    {
        console.warn("Missing map:", id);
    }
}
log("Loaded", allMaps.length, "maps");

const operations = require("./assets/json/operations.json");
var operationData = {};
for (var i = 0; i < operations.length; i++)
{
    let id = operations[i];
    try
    {
        operationData[id] = require("./assets/json/operations/" + id + ".json");
    }
    catch (e)
    {
        console.warn("Missing operation:", id);
    }
}
log("Loaded", Object.keys(operationData).length, "operations");

const p2 = require("p2");
const ngraphGraph = require("ngraph.graph");
const ngraphPath = require("ngraph.path");

//MongoDB
const { MongoClient } = require("mongodb");
const uri = "mongodb+srv://" + auth.user + ":" + auth.pass + "@cluster0.ecgzr.mongodb.net/?retryWrites=true&w=majority";

log(chalk.green("Done\n"));

app.get("/", function (req, res)
{
    //res.sendFile(__dirname + "/server.html");
    var sockets = getAllSockets();
    var font = "12px Arial";
    var str = "<head><title>Deadswitch 3 Multiplayer Server</title>";
    str += "<style>h1 { font-weight: 400; } body { background-color: #141414; font: " + font + "; color: #EEEEEE; } table { margin-top: 5px; font: " + font + "; border-collapse: collapse; background-color: #00000033 } th { text-align: left; background-color: #EEEEEE33; } .empty { color: #EEEEEE33; }</style>";
    str += "</head>";
    str += "<body><div id='wrapper'><div class='container'><div class='row'>";
    str += "<h1>Deadswitch 3 Multiplayer Server</h1>";
    str += "<b>v" + Server.VERSION + "</b><br>Started: " + (new Date(serverStartTime).toString());
    var upTime = convertMS(Date.now() - serverStartTime);
    str += "<br>Uptime: " + upTime.day + "d " + upTime.hour + "h " + upTime.minute + "m " + upTime.seconds + "s";  
    //Info
    var numParties = Object.keys(parties).length;
    str += "<br><br><b>" + numParties + "</b> part" + (numParties == 1 ? "y" : "ies");
    var numLobbies = getAllLobbies().length;
    str += "<br><b>" + numLobbies + "</b> lobb" + (numLobbies == 1 ? "y" : "ies");    
    var numGames = getLobbiesInProgress().length;
    str += "<br><b>" + numGames + "</b> in progress";
    str += "<br><b>" + sockets.length + "</b> player" + (sockets.length == 1 ? "" : "s") + " online";
    //Players
    if (sockets.length > 0)
    {
        str += "<div><table style='width:100%'><tr><th></th><th>Name</th><th>Username</th><th>Level</th><th>Status</th><th>Latency</th><th>Player ID</th><th>Version</th><th>Host</th><th>Steam ID</th></tr>";
        for (var i = 0; i < sockets.length; i++)
        {
            let socket = sockets[i];
            let info = socket.info;
            let player = socket.player;
            let curLobby = getLobbyData(player.currentLobbyId);
            let bInGame = false;
            let bPrivateLobby = false;
            if (curLobby)
            {
                if (curLobby.state === LobbyState.IN_PROGRESS)
                {
                    bInGame = true;
                }
                else if (curLobby.bPrivate)
                {
                    bPrivateLobby = true;
                }
            }
            str += "<tr><td>" + i + "</td><td>" + player.name + "</td><td>" + (info.username ? info.username : "-") + "</td><td>Level " + player.level + (player.prestige > 0 ? (" (Prestige " + player.prestige + ")") : "") + "</td><td>" + (bInGame ? "In Game" : (curLobby ? (bPrivateLobby ? "In Custom Lobby" : "In Lobby") : "Menu")) + (player.currentPartyId ? (" / Party #" + getPartyIndex(player.currentPartyId)) : "") + "</td><td>" + (player.latency ? (player.latency + " ms") : "-") + "</td><td>" + player.id + "</td><td>" + info.version + "</td><td>" + info.host + "</td><td>" + (player.steamId ? player.steamId : "-") + "</td></tr>";
        }
        str += "</table></div>";
    }  
    //Public lobbies
    var pubs = getAllPublicLobbies();
    str += "<h3>Public Lobbies (" + pubs.length + ")</h3>";
    str += "<div><table style='width:100%'><tr><th></th><th>Lobby ID</th><th>Game Mode</th><th>Players</th><th>State</th></tr>";
    for (var i = 0; i < pubs.length; i++)
    {
        var lobby = pubs[i];
        str += "<tr " + (lobby.players.length == 0 ? "class='empty'" : "") + "><td>" + i + "</td><td>" + lobby.id + "</td><td>" + lobby.gameModeId + "</td><td>" + lobby.players.length + "</td><td>" + lobby.state + "</td></tr>";
    }
    str += "</table></div>";
    //Custom lobbies
    var privateLobbies = lobbies["private"];
    str += "<h3>Custom Lobbies (" + privateLobbies.length + ")</h3>";
    if (privateLobbies.length > 0)
    {
        for (var i = 0; i < privateLobbies.length; i++)
        {
            let lobby = privateLobbies[i];
            if (i > 0)
            {
                str += "<br>";
            }
            str += lobby.gameModeId + " | " + lobby.gameData.mapId + " | <b>" + lobby.state + "</b>";
            let players = lobby.players;
            str += "<div><table style='width:100%'><tr><th></th><th>Name</th><th>Socket ID</th></tr>";
            for (var j = 0; j < players.length; j++)
            {             
                let player = players[j];
                str += "<tr><td><center>" + j + "</center></td><td>" + player.name + "</td><td>" + player.id + "</td></tr>";                
            }
            str += "</table></div>";
        }        
    }
    else
    {
        str += "<font class='empty'>None</font>";
    }
    //Chat
    str += "<h3>Global Chat</h3>";
    if (chatHistory.length > 0)
    {
        for (var i = 0; i < chatHistory.length; i++)
        {
            var msg = chatHistory[i];
            str += msg.date + " [<b>" + msg.playerText + "</b>] " + msg.messageText + "<br>";
        }
    }
    else
    {
        str += "<font class='empty'>None</font><br>";
    }
    //Stats
    str += "<h3>Cumulative Stats</h3>";
    var keys = Object.keys(stats);
    for (var i = 0; i < keys.length; i++)
    {
        str += keys[i] + ": " + stats[keys[i]] + "<br>";
    }
    str += "<h3>Memory Usage</h3>";
    var mem = process.memoryUsage();
    var keys = Object.keys(mem);    
    for (var i = 0; i < keys.length; i++)
    {
        str += keys[i] + ": " + Number((mem[keys[i]] / 1024 / 1024 * 100) / 100).toFixed(4) + "MB<br>";
    }       
    //Links
    //str += "<br><hr><a href='https://xwilkinx.com'>Wilkin Games</a> | <a href='https://xwilkinx.com/deadswitch-3'>Play Deadswitch 3</a>";
    str += "</div></div><body></html>";
    res.send(str);
});

app.get("/data", function (req, res)
{
    var data = {
        version: Server.VERSION,
        gameVersion: Server.GAME_VERSION,
        numClients: getNumClients(),
        maxClients: serverSettings.maxClients,
        time: Date.now()
    }
    if (serverSettings.welcomeMessage)
    {
        data.welcomeMessage = serverSettings.welcomeMessage;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "X-Requested-With,content-type");
    res.send(data);
});

const LobbyState = {
    INTERMISSION: "intermission",
    WAITING_HOST: "waiting_host",
    WAITING: "waiting",
    PREPARING: "preparing",
    STARTING: "starting",
    IN_PROGRESS: "in_progress"
};

const Lobby = {
    WAIT_TIMER: 33,
    INTERMISSION_TIMER: 15,    
    COUNTDOWN_PREPARING: 15,
    COUNTDOWN_STARTING: 3,
    COUNTDOWN_STARTING_PRIVATE: 3,
    JOIN_SUCCESS: "LOBBY_JOIN_SUCCESS",
    JOIN_FAIL_LOCKED: "JOIN_FAIL_LOCKED",
    JOIN_FAIL_CAPACITY: "JOIN_FAIL_CAPACITY",  
    JOIN_FAIL_ERROR: "JOIN_FAIL_ERROR",  
    MAX_PLAYERS: 8
};

const Party = {
    JOIN_SUCCESS: "PARTY_JOIN_SUCCESS",
    JOIN_FAIL_CAPACITY: "PARTY_JOIN_FAIL_CAPACITY",
    JOIN_FAIL_LOBBY: "PARTY_JOIN_FAIL_LOBBY",
    JOIN_FAIL_ERROR: "PARTY_JOIN_FAIL_ERROR",
    MAX_PLAYERS: 8
};

const MatchState = {
    PRE_GAME: "pre_game",
    IN_PROGRESS: "in_progress",
    POST_GAME: "post_game",
    END_RESULT_WIN: "end_result_win",
    END_RESULT_LOSS: "end_result_loss",
    END_RESULT_DRAW:  "end_result_draw",
    END_CONDITION_TIME: "end_condition_time",
    END_CONDITION_SCORE:  "end_condition_score",
    END_CONDITION_DEAD:  "end_condition_dead",
    END_CONDITION_FORFEIT: "end_condition_forfeit"
};

const GameServer = {
    EVENT_BATCH: 0,
    EVENT_GAME_INIT: 1,
    EVENT_GAME_TIMER: 2,
    EVENT_GAME_PRE_TIMER: 3,
    EVENT_GAME_START: 4,
    EVENT_GAME_END: 5,
    EVENT_GAME_UPDATE: 6,
    EVENT_STORE_BUY: 7,
    EVENT_GAME_MONEY_ADD: 8,
    EVENT_GAME_WAVE_START: 9,
    EVENT_GAME_WAVE_COMPLETE: 10,
    EVENT_GAME_PAUSE: 11,
    EVENT_REQUEST_RANKED_CHARACTER: 13,
    EVENT_CREATE_RANKED_CHARACTER: 14,
    EVENT_CREATE_GENERIC_CHARACTER: 15,
    EVENT_CREATE_INFESTOR: 16,
    EVENT_OBJECT_UPDATE: 17,
    EVENT_OBJECT_HIT: 18,
    EVENT_PAWN_DAMAGE: 19,
    EVENT_PAWN_DIE: 20,
    EVENT_PAWN_ACTION: 21,
    EVENT_SET_PLAYER_CONTROLLER_ID: 22,
    EVENT_CREATE_AI_CONTROLLER: 23,
    EVENT_PLAYER_JOIN: 24,
    EVENT_PLAYER_LEAVE: 25,
    EVENT_PLAYER_UPDATE: 26,
    EVENT_PLAYER_RESPAWN: 27,
    EVENT_PLAYER_EARN_KILLSTREAK: 28,
    EVENT_PLAYER_USE_KILLSTREAK: 29,
    EVENT_PLAYER_OPEN_WORLD_MENU: 30,
    EVENT_PLAYER_CLOSE_WORLD_MENU: 31,
    EVENT_PLAYER_SET_WORLD_POSITION: 32,
    EVENT_PLAYER_EXECUTE_KILLSTREAK: 33,
    EVENT_PLAYER_FLAG: 34,
    EVENT_PLAYER_MULTI_KILL: 35,
    EVENT_PLAYER_UPDATE_CONTROLLABLE: 36,
    EVENT_PLAYER_INPUT: 37,
    EVENT_PLAYER_INTERACT: 38,
    EVENT_PLAYER_UPDATE_INVENTORY: 39,
    EVENT_PLAYER_TRIGGER_WEAPON: 40,
    EVENT_PLAYER_TRIGGER_EQUIPMENT: 41,
    EVENT_PLAYER_TRIGGER_MELEE: 42,
    EVENT_KILLSTREAKS_UPDATE: 43,
    EVENT_ANNOUNCER_MESSAGE: 44,
    EVENT_KILLFEED_ADD: 45,
    EVENT_MESSAGE_ADD: 46,
    EVENT_SPAWN_OBJECT: 47,
    EVENT_SPAWN_BULLET: 48,
    EVENT_SPAWN_EXPLOSION: 49,
    EVENT_SPAWN_GRENADE: 50,
    EVENT_SPAWN_PROJECTILE: 51,
    EVENT_SPAWN_ROCKET: 52,
    EVENT_SPAWN_DROPPED_WEAPON: 53,
    EVENT_SPAWN_CRATE: 54,
    EVENT_SPAWN_FLAG: 55,
    EVENT_SPAWN_EQUIPMENT: 56,
    EVENT_SPAWN_HELICOPTER: 57,
    EVENT_SPAWN_TURRET: 58,
    EVENT_SPAWN_REVIVER: 59,
    EVENT_INTERACTABLE_USED: 60,
    EVENT_REMOVE_OBJECT: 61,
    EVENT_SANDBOX: 62,
    EVENT_ROUND_END: 63,
    EVENT_ROUND_START: 64,
    EVENT_BATTLEZONE: 65,
    EVENT_SWITCH_TEAMS: 66
};

const GameMode = {
    SANDBOX: "sandbox",
    BATTLEZONE: "battlezone",
    DEATHMATCH: "deathmatch",
    TEAM_DEATHMATCH: "team_deathmatch",
    DOMINATION: "domination",
    CAPTURE_THE_FLAG: "capture_the_flag",
    DEFENDER: "defender",
    DEMOLITION: "demolition",
    HEADQUARTERS: "headquarters",
    GUN_GAME: "gun_game",
    INFECTED: "infected",
    SURVIVAL_BASIC: "survival_basic",
    SURVIVAL_UNDEAD: "survival_undead",
    SURVIVAL_CHAOS: "survival_chaos",
    SURVIVAL_STAKEOUT: "survival_stakeout",
    SURVIVAL_PRO: "survival_pro",
    RANDOM: "mode_random",
    OPERATION: "mode_operation",
    ROTATION_TEAM: "mode_rotation_team",
    ROTATION_SURVIVAL: "mode_rotation_survival",
    ROTATION_COMMUNITY: "mode_rotation_community",
    GROUND_WAR: "mode_ground_war",
    COMBAT_TRAINING: "mode_combat_training",
    HARDCORE: "mode_hardcore"
};

const Map = {
    RIVERSIDE: "map_riverside",
    DOWNTURN: "map_downturn",
    OUTPOST: "map_outpost",
    ESTATE: "map_estate",
    DISTRICT: "map_district",
    SANDSTORM: "map_sandstorm",
    OVERGROWN: "map_overgrown",
    WAREHOUSE: "map_warehouse",
    FACTORY: "map_factory",
    AIRPORT: "map_airport",
    DOWNTURN_EXTENDED: "map_downturn_extended",
    BATTLESHIP: "map_battleship",
    RANDOM: "map_random"
};

const Character = {
    TYPE_HAIR_COLOUR: "hairColour",
    TYPE_HAIR: "hair",
    TYPE_BEARD: "beard",
    TYPE_HEAD: "head",
    TYPE_BODY: "body",
    TYPE_FACE: "face",
    TYPE_FACEWEAR: "facewear",
    TYPE_EYEWEAR: "eyewear",
    TYPE_VOICE: "voice",
    VOICE_A: "a",
    VOICE_B: "b",
    VOICE_RU: "ru",
    VOICE_UK: "uk",
    VOICE_ZOMBIE: "zombie",
    HAIR_COLOUR_BROWN: "HAIR_COLOUR_BROWN",
    HAIR_COLOUR_BROWN_LIGHT: "HAIR_COLOUR_BROWN_LIGHT",
    HAIR_COLOUR_BLACK: "HAIR_COLOUR_BLACK",
    HAIR_COLOUR_BLONDE: "HAIR_COLOUR_BLONDE",
    HAIR_COLOUR_GINGER: "HAIR_COLOUR_GINGER",
    HAIR_COLOUR_GREY: "HAIR_COLOUR_GREY",
    HAIR_COLOUR_WHITE: "HAIR_COLOUR_WHITE",
    HAIR_COLOUR_RED: "HAIR_COLOUR_RED",
    HAIR_COLOUR_BLUE: "HAIR_COLOUR_BLUE",
    HAIR_COLOUR_GREEN: "HAIR_COLOUR_GREEN",
    FACE_DEFAULT: "face0000",
    FACE_ZOMBIE_1: "face0001",
    FACE_ZOMBIE_2: "face0002",
    FACE_ZOMBIE_3: "face0003",
    FACE_ZOMBIE_4: "face0004",
    FACE_ZOMBIE_FAT: "face0005",
    FACE_ZOMBIE_EXPLODER: "face0006",
    FACE_ZOMBIE_SPITTER: "face0007",
    FACE_ZOMBIE_SPRINTER: "face0008",
    HAIR_SHORT: "hair0000",
    HAIR_BALD: "hair0008",
    HAIR_LONG: "hair0002",
    HAIR_PONYTAIL: "hair0003",
    HAIR_UNDERCUT: "hair0006",
    HAIR_SPIKES: "hair0005",
    HAIR_BUZZED: "hair0004",
    HAIR_FLAT: "hair0001",
    HAIR_STYLED: "hair0007",
    HAIR_HORSESHOE: "hair0009",
    HAIR_MOHAWK: "hair0010",
    BEARD_NONE: "beard0000",
    BEARD_STUBBLE: "beard0001",
    BEARD_FULL: "beard0002",
    BEARD_CIRCLE: "beard0003",
    BEARD_GOATEE: "beard0004",
    BEARD_MOUSTACHE: "beard0005",
    BEARD_SIDEBURNS: "beard0006",
    EYEWEAR_NONE: "eyewear0000",
    EYEWEAR_SHADES: "eyewear0001",
    EYEWEAR_GLASSES: "eyewear0002",
    EYEWEAR_GOGGLES_YELLOW: "eyewear0003",
    EYEWEAR_GOGGLES_ORANGE: "eyewear0004",
    EYEWEAR_GOGGLES_WHITE: "eyewear0005",
    EYEWEAR_GOGGLES_BLACK: "eyewear0006",
    FACEWEAR_NONE: "facewear0000",
    FACEWEAR_MASK: "facewear0001",
    FACEWEAR_SKULLMASK: "facewear0002",
    FACEWEAR_GHILLIE: "facewear0003",
    FACEWEAR_SCARF_OPFOR: "facewear0004",
    FACEWEAR_BALACLAVA: "facewear0005",
    FACEWEAR_SCARF_SPETSNAZ: "facewear0006",
    FACEWEAR_BANDANA: "facewear0007",
    FACEWEAR_GAS_MASK: "facewear0008",
    FACEWEAR_BANDANA_GENERIC: "facewear0009",
    FACEWEAR_GAITER: "facewear0010",
    HEAD_DELTA_MEDIC_HELMET: "head0064",
    HEAD_GIGN_MEDIC_HELMET: "head0065",
    HEAD_GSG9_MEDIC_HELMET: "head0066",
    HEAD_MEDIC_HELMET: "head0067",
    HEAD_NONE: "head0000",
    HEAD_MASK: "head0001",
    HEAD_GAS_MASK: "head0002",
    HEAD_RADIO: "head0003",
    HEAD_USMC_MASK: "head0004",
    HEAD_USMC_CAP: "head0005",
    HEAD_USMC_CAP_BACKWARDS: "head0006",
    HEAD_USMC_SPEC_OPS: "head0007",
    HEAD_USMC_HELMET: "head0008",
    HEAD_USMC_HELMET_TACTICAL: "head0009",
    HEAD_USMC_BOONIE: "head0010",
    HEAD_USMC_GHILLIE: "head0011",
    HEAD_GIGN_HELMET: "head0012",
    HEAD_GIGN_HELMET_2: "head0013",
    HEAD_GIGN_CAP: "head0014",
    HEAD_GSG9_HELMET: "head0015",
    HEAD_GSG9_HELMET_2: "head0016",
    HEAD_GSG9_HELMET_3: "head0017",
    HEAD_OPFOR_SCARF: "head0018",
    HEAD_OPFOR_HELMET: "head0019",
    HEAD_OPFOR_HELMET_2: "head0020",
    HEAD_OPFOR_BERET: "head0021",
    HEAD_OPFOR_SHADES: "head0022",
    HEAD_OPFOR_COMMANDER: "head0023",
    HEAD_RUS_MASK: "head0024",
    HEAD_RUS_HAT: "head0025",
    HEAD_RUS_SCARF: "head0026",
    HEAD_RUS_TOQUE: "head0027",
    HEAD_RUS_BERET: "head0028",
    HEAD_RUS_CAP: "head0029",
    HEAD_RUS_RECON: "head0030",
    HEAD_RUS_HELMET: "head0031",
    HEAD_MILITIA_RADIO: "head0032",
    HEAD_MILITIA_BAND: "head0033",
    HEAD_MILITIA_BANDANA: "head0034",
    HEAD_MILITIA_CAP: "head0035",
    HEAD_MILITIA_SNIPER: "head0036",
    HEAD_JUGGERNAUT_HELMET: "head0037",
    BODY_VIP: "vip",
    BODY_HOSTAGE: "hostage",
    BODY_USMC_STANDARD: "usmc",
    BODY_USMC_GHILLIE: "usmc_ghillie",
    BODY_USMC_HEAVY: "usmc_heavy",
    BODY_USMC_PARA: "usmc_para",
    BODY_USMC_RECON: "usmc_recon",
    BODY_GIGN_STANDARD: "gign",
    BODY_GIGN_HEAVY: "gign_heavy",
    BODY_GIGN_PARA: "gign_para",
    BODY_GIGN_RECON: "gign_recon",
    BODY_GIGN_TACTICAL: "gign_tactical",
    BODY_GSG9_STANDARD: "gsg9",
    BODY_GSG9_HEAVY: "gsg9_heavy",
    BODY_GSG9_PARA: "gsg9_para",
    BODY_GSG9_RECON: "gsg9_recon",
    BODY_GSG9_TACTICAL: "gsg9_tactical",
    BODY_OPFOR_STANDARD: "opfor",
    BODY_OPFOR_ROCKETIER: "opfor_rocketier",
    BODY_OPFOR_HEAVY: "opfor_heavy",
    BODY_OPFOR_PARA: "opfor_para",
    BODY_OPFOR_RECON: "opfor_recon",
    BODY_RUS_STANDARD: "rus",
    BODY_RUS_BARE: "rus_bare",
    BODY_RUS_HEAVY: "rus_heavy",
    BODY_RUS_PARA: "rus_para",
    BODY_RUS_RECON: "rus_recon",
    BODY_RUS_ROCKETIER: "rus_rocketier",
    BODY_JUGGERNAUT: "rus_juggernaut",
    BODY_MILITIA_STANDARD: "militia",
    BODY_MILITIA_HEAVY: "militia_heavy",
    BODY_MILITIA_PARA: "militia_para",
    BODY_MILITIA_RECON: "militia_recon",
    BODY_MILITIA_TACTICAL: "militia_tactical",
    BODY_USMC_KEVLAR: "usmc_kevlar",
    BODY_GIGN_KEVLAR: "gign_kevlar",
    BODY_GSG9_KEVLAR: "gsg9_kevlar",
    BODY_OPFOR_KEVLAR: "opfor_kevlar",
    BODY_RUS_KEVLAR: "rus_kevlar",
    BODY_MILITIA_KEVLAR: "militia_kevlar",
    BODY_ZOMBIE: "zombie",
    BODY_ZOMBIE_2: "zombie_2",
    BODY_ZOMBIE_3: "zombie_3",
    BODY_ZOMBIE_FAT: "zombie_fat",
    BODY_ZOMBIE_EXPLODER: "zombie_exploder",
    BODY_ZOMBIE_EXPLODER_BOSS: "zombie_exploder_boss",
    BODY_ZOMBIE_SPITTER: "zombie_spitter",
    BODY_ZOMBIE_SPITTER_BOSS: "zombie_spitter_boss",
    BODY_ZOMBIE_SPRINTER: "zombie_sprinter",
    BODY_ZOMBIE_SPRINTER_BOSS: "zombie_sprinter_boss"
};

server.listen(process.env.PORT || serverSettings.port, function ()
{
    log("\nListening on " + server.address().family + " " + chalk.inverse(server.address().address) + ":" + chalk.inverse(server.address().port) + "\n");
});

//Initialize server
log(chalk.yellow("Initializing server..."));
initLobbies();
log(chalk.green("Done"));

io.sockets.on("connection", function (socket)
{
    log(tracePlayer(socket), chalk.green("Connected"), "|", getNumClients(), "connected");
    stats.playersConnected++;
    stats.peakPlayersConnected = Math.max(stats.peakPlayersConnected, getNumClients());
    socket.player = {
        id: genIdFromSocket(socket),
        name: "Player",
        level: 1,
        prestige: 0
    };   
    socket.info = {
        autoJoinAttempts: 0
    };
    if (getNumClients() > serverSettings.maxClients)
    {
        console.warn("Maximum number of clients reached!", getNumClients());
        socket.emit("showWindow", {
            titleText: "STR_SERVER_FULL",
            messageText: "STR_SERVER_FULL_DESC",
            bShowOkayButton: true
        });
        socket.disconnect();
        return;
    }

    socket.emit("onConnect", Server.OFFICIAL, {
        welcomeMessage: serverSettings.welcomeMessage
    });

    socket.on("completeClanChallenge", function (_data)
    {
        throttleSocket(socket);        
        actionLimiter.consume(socket.id).
            then(() =>
            {
                if (socket.player)
                {
                    var clan = socket.player.clan;
                    if (clan)
                    {
                        log(tracePlayer(socket), "Complete clan challenge", _data);
                        async_updateClanScore(clan, 1, 0);
                    }
                }
            }).catch(r =>
            {
                //...
            });
    });

    socket.on("updatePlayerData", function (_data)
    {
        //throttleSocket(socket);
        actionLimiter.consume(socket.id).
            then(() =>
            {
                log(tracePlayer(socket), "Update player data");
                if (!_data)
                {
                    return;
                }
                if (_data.version)
                {
                    //Version format: [MAJOR].[MINOR].[PATCH]
                    var required = Server.GAME_VERSION.split(".");
                    var version = _data.version.split(".");
                    if (version.length != 3 || parseInt(version[0]) < parseInt(required[0]) || parseInt(version[1]) < parseInt(required[1]) || parseInt(version[2]) < parseInt(required[2]))
                    {
                        log(tracePlayer(socket), _data["host"], "Game version mismatch:", chalk.yellow("Required: " + Server.GAME_VERSION), "|", chalk.red("Client: " + _data.version));
                        socket.emit("showWindow", {
                            id: "mp_mismatch",
                            titleText: "STR_MENU_MULTIPLAYER",
                            messageText: "STR_VERSION_MISMATCH_DESC",
                            messageParams: [_data.version, Server.GAME_VERSION],
                            version: _data.version,
                            required: Server.GAME_VERSION,
                            type: "TYPE_YES_NO",
                            yesText: "STR_PLAY_LATEST_VERSION",
                            yesURL: "https://xwilkinx.com/deadswitch-3"
                        });
                        socket.disconnect();
                        return;
                    }
                    /*
                    if (!_data.username && !_data.steamId)
                    {
                        showMultiplayerLoginWindow(socket);
                        socket.disconnect();
                        return;
                    }
                    */
                    if (serverSettings.bannedUsernames && _data.username)
                    {
                        for (var i = 0; i < serverSettings.bannedUsernames.length; i++)
                        {
                            if (_data.username == serverSettings.bannedUsernames[i])
                            {
                                showBannedWindow(socket);
                                socket.disconnect();
                                break;
                            }
                        }
                    }
                    if (serverSettings.bannedSteamIds && _data.steamId)
                    {
                        for (var i = 0; i < serverSettings.bannedSteamIds.length; i++)
                        {
                            if (_data.steamId == serverSettings.bannedSteamIds[i])
                            {
                                showBannedWindow(socket);
                                socket.disconnect();
                                break;
                            }
                        }
                    }
                    if (verifyClientPlayerData(_data))
                    {
                        var latency = socket.player.latency;
                        var lobbyId = socket.player.currentLobbyId;
                        var partyId = socket.player.currentPartyId;
                        var lobbyData = getLobbyData(lobbyId);
                        if (lobbyData && lobbyData.game)
                        {
                            socket.player.level = _data.level;
                        }
                        else
                        {
                            //Initial update
                            if (!socket.player.version)
                            {
                                socket.info.host = _data.host;
                                socket.info.version = _data.version;
                            }

                            //Create player object
                            _data.id = genIdFromSocket(socket);
                            socket.player = clone(_data);
                            delete socket.player.host;
                            delete socket.player.href;
                            delete socket.player.version;
                            delete socket.player.stats;

                            //Update previous values
                            socket.player.latency = latency;
                            socket.player.currentLobbyId = lobbyId;
                            socket.player.currentPartyId = partyId;
                            if (lobbyData)
                            {
                                var lobbyPlayer = getLobbyPlayerById(lobbyId, getSocketPlayerId(socket));
                                if (lobbyPlayer)
                                {
                                    lobbyPlayer.name = socket.player.name;
                                    lobbyPlayer.level = socket.player.level;
                                    lobbyPlayer.prestige = socket.player.prestige;
                                    lobbyPlayer.card = socket.player.card;
                                    lobbyPlayer.callsign = socket.player.callsign;
                                    lobbyPlayer.avatars = socket.player.avatars;
                                    lobbyPlayer.killstreaks = socket.player.killstreaks;
                                    io.sockets.in(lobbyId).emit("updateLobby", {
                                        players: lobbyData.players
                                    });
                                }
                            }
                            if (partyId)
                            {
                                var partyPlayer = getPartyPlayerById(partyId, getSocketPlayerId(socket));
                                if (partyPlayer)
                                {
                                    lobbyPlayer.name = socket.player.name;
                                    partyPlayer.card = socket.player.card;
                                    partyPlayer.callsign = socket.player.callsign;
                                }
                                updatePartyClients(partyId);
                            }
                        }
                        broadcastServerData();
                    }
                    else
                    {
                        showClientDataFailedWindow(socket);
                        socket.disconnect();
                    }
                }
                if (socket.player && socket.info)
                {
                    if (_data.username !== undefined)
                    {
                        socket.info.username = _data.username;
                        async_getClanForSocket(socket);                        
                    }
                    if (_data.stats !== undefined)
                    {
                        socket.stats = _data.stats;
                    }
                    if (_data.battlezone !== undefined)
                    {
                        socket.player.battlezone = clone(_data.battlezone);
                    }
                }
            }).
            catch(r =>
            {
                //...
            });
    });

    socket.on("updateClientLatency", function (_ms)
    {
        //throttleSocket(socket);
        if (socket.player)
        {
            socket.player["latency"] = _ms;
            if (_ms >= serverSettings.maxLatency)
            {
                disconnectSocket(socket, { reason: "latency" });
                return;
            }
            if (socket.player.currentLobbyId && socket.player.bReady)
            {
                var lobbyData = getLobbyData(socket.player.currentLobbyId);
                if (lobbyData)
                {
                    if (!lobbyData["bPrivate"] && _ms >= serverSettings.maxLobbyLatency)
                    {
                        removeSocketPlayerFromLobby(socket, "latency");
                    }
                    else
                    {
                        var game = lobbyData["game"];
                        if (game)
                        {
                            game.setPlayerLatency(getSocketPlayerId(socket), _ms);
                        }
                    }
                }
            }
        }
    });

    socket.on("createClan", function (_name)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to create clan:", _name);
        if (socket.player)
        {
            if (socket.player.clan)
            {
                socket.emit("onCreateClan", {
                    bSuccess: false,
                    message: "You must leave your current clan before creating a new one.",
                    key: "STR_ERROR_CLAN_LEAVE_CURRENT_CLAN"
                });
                return;
            }
            if (socket.info.username)
            {
                var clanName = _name;
                async_createClan(socket, clanName);
            }
            else
            {
                socket.emit("onCreateClan", {
                    bSuccess: false,
                    message: "You must be logged into a Deadswitch 3 account to create a new clan.",
                    key: "STR_ERROR_CREATE_CLAN_NOT_LOGGED_IN"
                });
                return;
            }
        }
    });

    socket.on("joinClan", function (_name)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to join clan:", _name);
        if (socket.player)
        {
            if (socket.player.clan)
            {
                return;
            }
            if (socket.info.username)
            {
                async_joinClan(socket, _name);
            }
        }
    });

    socket.on("getClanData", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to get clan data");
        async_getClanData(socket);
    });

    socket.on("leaveClan", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to leave clan");
        async_leaveClanBySocket(socket);
    });

    socket.on("getPlayerData", function ()
    {
        throttleSocket(socket);
        if (socket.player)
        {
            socket.emit("getPlayerData", socket.player);
        }
    });

    socket.on("requestQuit", function ()
    {
        throttleSocket(socket);
        if (!socket.player)
        {
            return;
        }
        var lobbyId = socket.player.currentLobbyId;
        log(tracePlayer(socket), "Request quit in lobby", chalk.bgCyan(lobbyId));
        var party = getParty(socket.player.currentPartyId);
        if (party)
        {
            if (party.hostPlayerId != getSocketPlayerId(socket))
            {
                removePlayerFromParty(socket);
            }
        }
        var lobbyData = getLobbyData(lobbyId);
        if (lobbyData)
        {
            if (lobbyData["bPrivate"])
            {
                if (lobbyData.hostPlayerId == getSocketPlayerId(socket))
                {
                    setLobbyState(lobbyId, LobbyState.WAITING_HOST);
                    io.sockets.in(lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
                }
                else
                {
                    removeSocketPlayerFromLobby(socket, "client_quit");
                }
            }
            else
            {
                var party = getParty(socket.player.currentPartyId);
                if (party)
                {
                    if (party.hostPlayerId == getSocketPlayerId(socket) && party.players.length > 1)
                    {
                        removePlayerFromParty(socket);
                    }
                }
                removeSocketPlayerFromLobby(socket, "client_quit");
            }
        }
    });

    socket.on("requestGame", function ()
    {
        throttleSocket(socket);
        var lobbyId = socket.player.currentLobbyId;
        log(tracePlayer(socket), "requests game in", chalk.bgCyan(lobbyId));
        var lobbyData = getLobbyData(lobbyId);
        if (lobbyData)
        {
            var game = lobbyData["game"];
            if (game)
            {
                //Add player to game in progress
                log(chalk.bgCyan(lobbyId), "Game in progress");   

                var items = [];

                if (lobbyData["bAddBots"])
                {
                    var numKicked = 0;
                    for (var i = 0; i < lobbyData.players.length; i++)
                    {
                        if (lobbyData.players.length > lobbyData.maxPlayers)
                        {
                            var curPlayer = lobbyData.players[i];
                            if (curPlayer["bBot"] && curPlayer["team"] == socket.player.team)
                            {
                                game.requestEvent({
                                    eventId: GameServer.EVENT_PLAYER_LEAVE,
                                    reason: "kicked",
                                    playerId: curPlayer["id"]
                                });
                                lobbyData.players.splice(i, 1);
                                numKicked++;
                            }
                        }
                    }
                    if (!numKicked)
                    {
                        for (var i = 0; i < lobbyData.players.length; i++)
                        {
                            if (lobbyData.players.length > lobbyData.maxPlayers)
                            {
                                var curPlayer = lobbyData.players[i];
                                if (curPlayer["bBot"])
                                {
                                    game.requestEvent({
                                        eventId: GameServer.EVENT_PLAYER_LEAVE,
                                        reason: "kicked",
                                        playerId: curPlayer["id"]
                                    });
                                    lobbyData.players.splice(i, 1);
                                    numKicked++;
                                }
                            }
                        }
                    }
                }

                items.push(game.getInitEventData());
                game.addPlayer(clone(socket.player));
                items.push(game.getGameModeEventData());

                if (game.matchInProgress())
                {
                    items.push(game.getGameStartEventData());
                }                
                var gamePlayers = game.getPlayerStates(); 
                for (var i = 0; i < gamePlayers.length; i++)
                {
                    let curPlayerState = gamePlayers[i];
                    if (curPlayerState["id"] != getSocketPlayerId(socket))
                    {
                        items.push({
                            eventId: GameServer.EVENT_PLAYER_JOIN,
                            playerId: curPlayerState["id"],
                            data: curPlayerState,
                            bSilent: true
                        });
                    }
                }
                var all = game.getObjectsEventData();
                for (var i = 0; i < all.length; i++)
                {
                    items.push(all[i]);
                }     

                log(items.length, "events");

                socket.emit("gameEvent", {
                    eventId: GameServer.EVENT_BATCH,
                    lobbyId: lobbyId,
                    items: items
                }); 
            }
            else
            {
                var players = lobbyData["players"];
                var numReady = 0;
                var numBots = getNumBotsInLobby(lobbyId);
                var numDummies = getNumDummiesInLobby(lobbyId);
                var numNeeded = players.length - (numBots + numDummies);
                for (i = 0; i < players.length; i++)
                {
                    ps = players[i];
                    if (ps["id"] == getSocketPlayerId(socket))
                    {
                        ps["bReady"] = true;
                        numReady++;
                    }
                    else if (ps["bReady"])
                    {
                        numReady++;
                    }
                }
                log(chalk.bgCyan(lobbyId), "Players ready:", numReady, "/", numNeeded);                
                if (numNeeded == 0)
                {
                    endLobbyGame(lobbyId, false);
                }
                else
                {
                    var playerDetails = [];
                    for (var i = 0; i < players.length; i++)
                    {
                        var curPlayer = players[i];
                        playerDetails.push(curPlayer);
                    }
                    io.sockets.in(lobbyId).emit("updatePlayersReady", {
                        players: playerDetails,
                        numReady: numReady,
                        numNeeded: numNeeded
                    });
                    if (numReady == numNeeded)
                    {
                        log(chalk.bgCyan(lobbyId), chalk.green("All players ready"));
                        var gameData = lobbyData["gameData"];
                        gameData["maxPlayers"] = lobbyData["maxPlayers"];
                        gameData["bPrivate"] = lobbyData["bPrivate"];
                        onInitGame(lobbyId, gameData);
                    }
                }                
            }
        }
    });

    socket.on("requestEvent", function (_data)
    {
        if (!socket.player || !_data)
        {
            //console.warn(tracePlayer(socket), "Invalid player data", _data);
            socket.disconnect();
            return;
        }
        throttleSocket(socket, _data);
        var bThrottle = false;
        gameLimiter.consume(socket.id).
            then(() =>
            {
                bThrottle = false;
            }).
            catch(r =>
            {
                bThrottle = true;
            });
        if (!bThrottle)
        {
            //Events requested by client directly
            var lobbyId = socket.player.currentLobbyId;
            var game = getGame(lobbyId);
            if (game)
            {
                var bProcess = true;
                var bKickPlayer = true;
                switch (_data["eventId"])
                {
                    case GameServer.EVENT_PLAYER_UPDATE_INVENTORY:
                        if (socket.id.indexOf(_data["pawnId"]) == -1)
                        {
                            bProcess = false;
                        }
                        break;

                    case GameServer.EVENT_PLAYER_UPDATE_CONTROLLABLE:
                    case GameServer.EVENT_PLAYER_INPUT:
                    case GameServer.EVENT_BATTLEZONE:
                    case GameServer.EVENT_SWITCH_TEAMS:
                        if (socket.id.indexOf(_data["playerId"]) == -1)
                        {
                            bProcess = false;
                            bKickPlayer = _data["playerId"] != "playerController";
                        }
                        break;

                    case GameServer.EVENT_PLAYER_EARN_KILLSTREAK:
                        bProcess = false;
                        bKickPlayer = true;
                        break;
                }
                if (!bProcess)
                {
                    console.warn(tracePlayer(socket), "Cheat detected", _data);
                    //removePlayerFromLobby(socket, "cheating");
                    if (bKickPlayer)
                    {
                        socket.disconnect();
                    }
                }
                if (bProcess)
                {
                    game.requestEvent(_data);
                }
            }
        }
    });

    socket.on("joinParty", function (_id)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to join party", chalk.bgCyan(_id));
        if (socket.player.currentPartyId)
        {
            log("Already in party!");
            return;
        }
        var party = getParty(_id);
        if (party)
        {
            var result = canJoinParty(_id, socket);
            switch (result)
            {
                case Party.JOIN_SUCCESS:
                    joinParty(_id, socket);
                    var host = getSocketByPlayerId(party.hostPlayerId);
                    if (host)
                    {
                        if (host.player.currentLobbyId)
                        {
                            var result = canJoinLobby(host.player.currentLobbyId, socket);
                            switch (result)
                            {
                                case Lobby.JOIN_SUCCESS:
                                    joinLobby(host.player.currentLobbyId, socket);
                                    break;
                            }
                        }
                    }
                    break;

                case Party.JOIN_FAIL_CAPACITY:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_PARTY_MAX_CAPACITY_DESC",
                        bShowOkayButton: true
                    });
                    break;               

                case Lobby.JOIN_FAIL_CAPACITY:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_CUSTOM_LOBBY_MAX_CAPACITY_DESC",
                        bShowOkayButton: true
                    });
                    break;

                case Lobby.JOIN_FAIL_LOCKED:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_PARTY_LOCKED_DESC",
                        bShowOkayButton: true
                    });
                    break;

                default:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_ERROR_DESC",
                        bShowOkayButton: true
                    });
                    break;
            }
        }
        else
        {
            socket.emit("showWindow", {
                titleText: "STR_ERROR",
                messageText: "STR_PARTY_NON_EXISTANT_DESC",
                messageParams: [_id],
                highlights: [_id],
                bShowOkayButton: true
            });
        }
    });

    socket.on("requestParty", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Requests party data");
        if (socket.player && socket.player.currentPartyId)
        {
            var party = getParty(socket.player.currentPartyId);
            if (party)
            {
                socket.emit("updateParty", party);
            }
        }
    });

    socket.on("leaveParty", function (_id)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to leave party", chalk.bgCyan(socket.player.currentPartyId));
        removePlayerFromParty(socket);
    });

    socket.on("getPlayerList", function ()
    {
        throttleSocket(socket);
        actionLimiter.consume(socket.id).
            then(() =>
            {
                log(tracePlayer(socket), "Wants to get player list");
                socket.emit("receivePlayerList", {
                    id: "players_all",
                    players: getAllPlayers()
                });
            }).
            catch(r =>
            {
                //...
            });        
    });

    socket.on("getClanPlayerList", function ()
    {
        throttleSocket(socket);
        actionLimiter.consume(socket.id).
            then(() =>
            {
                if (socket.player.clan)
                {
                    log(tracePlayer(socket), "Wants to get clan player list");
                    getAllClanPlayers(socket);
                }                
            }).
            catch(r =>
            {
                //...
            });
    });

    socket.on("getClanInvitePlayerList", function ()
    {
        throttleSocket(socket);
        actionLimiter.consume(socket.id).
            then(() =>
            {
                if (socket.player.clan)
                {
                    log(tracePlayer(socket), "Wants to get clan invite player list");
                    socket.emit("receivePlayerList", {
                        id: "players_clan_invite",
                        players: getClanInvitablePlayers()
                    });
                }
            }).
            catch(r =>
            {
                //...
            });
    });

    socket.on("getLobbyList", function ()
    {
        throttleSocket(socket);       
        actionLimiter.consume(socket.id).
            then(() =>
            {
                log(tracePlayer(socket), "Wants to get lobby list");
                socket.emit("receiveLobbyList", getLobbyList(socket));
            }).
            catch(r =>
            {
                //...
            }); 
    });

    socket.on("getClanList", function ()
    {
        throttleSocket(socket);
        actionLimiter.consume(socket.id).
            then(() =>
            {
                log(tracePlayer(socket), "Wants to get clan list");
                async_getClanList(socket);
            }).
            catch(r =>
            {
                //...
            });
    });

    socket.on("getPlayerInfo", function (_id)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to get player info:", _id);
        if (dummies)
        {
            for (var i = 0; i < dummies.length; i++)
            {
                var bot = dummies[i];
                if (bot.id == _id)
                {
                    var playerData = {
                        player: bot,
                        stats: {
                            xp: bot.level * (MathUtil.Random(1000, 10000)),
                            kills: MathUtil.Random(100, 10000),
                            deaths: MathUtil.Random(50, 1000),
                            challengesCompleted: MathUtil.Random(0, 100),
                            games_played: MathUtil.Random(10, 1000),
                            games_won: MathUtil.Random(0, 500)
                        }
                    };
                    var curLobby = getLobbyData(bot.currentLobbyId);
                    if (curLobby)
                    {
                        playerData["gameModeId"] = curLobby.rotationId ? curLobby.rotationId : curLobby.gameModeId;
                        if (curLobby.bPrivate)
                        {
                            playerData["bPrivateLobby"] = true;
                        }
                        if (curLobby.state == LobbyState.IN_PROGRESS)
                        {
                            playerData["bInGame"] = true;
                        }
                        playerData["bCanJoin"] = canJoinLobby(curLobby.id, socket) == Lobby.JOIN_SUCCESS && !curLobby.gameData.settings["bPrivate"];
                    }
                    socket.emit("receivePlayerInfo", playerData);
                    return;
                }
            }
        }
        var infoSocket = getSocketByPlayerId(_id);
        if (infoSocket)
        {
            var playerData = {
                player: infoSocket.player,
                stats: infoSocket.stats
            };
            var curLobby = getLobbyData(infoSocket.player.currentLobbyId);
            if (curLobby)
            {
                playerData["gameModeId"] = curLobby.rotationId ? curLobby.rotationId : curLobby.gameModeId;
                if (curLobby.bPrivate)
                {
                    playerData["bPrivateLobby"] = true;
                }
                if (curLobby.state == LobbyState.IN_PROGRESS)
                {
                    playerData["bInGame"] = true;
                }
                playerData["bCanJoin"] = canJoinLobby(curLobby.id, socket) == Lobby.JOIN_SUCCESS && !curLobby.gameData.settings["bPrivate"];
            }
            socket.emit("receivePlayerInfo", playerData);
        }
    });

    socket.on("getChatHistory", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to get chat history");
        socket.emit("receiveChatHistory", chatHistory);
    });

    socket.on("inviteToParty", function (_playerId)
    {
        throttleSocket(socket);
        var partyId = socket.player ? socket.player.currentPartyId : null;
        if (partyId)
        {
            var invitedSocket = getSocketByPlayerId(_playerId);
            if (invitedSocket && invitedSocket.player && invitedSocket.player["bAllowPartyInvites"])
            {
                if (invitedSocket.player.currentPartyId != partyId)
                {
                    log(tracePlayer(socket), "Wants to invite", tracePlayer(invitedSocket), "to their party");
                    invitedSocket.emit("serverMessage", {
                        type: "party_invite",
                        partyId: partyId,
                        player: socket.player,
                        id: partyId
                    });
                }
            }
        }
    });

    socket.on("inviteToClan", function (_playerId)
    {
        throttleSocket(socket);
        var clan = socket.player.clan;
        if (clan)
        {
            var invitedSocket = getSocketByPlayerId(_playerId);
            if (invitedSocket && invitedSocket.player && invitedSocket.player["bAllowPartyInvites"])
            {
                if (!invitedSocket.player.clan)
                {
                    log(tracePlayer(socket), "Wants to invite", tracePlayer(invitedSocket), "to clan");
                    invitedSocket.emit("serverMessage", {
                        type: "clan_invite",
                        clan: clan,
                        player: socket.player,
                        id: clan
                    });
                }
            }
        }
    });

    socket.on("joinLobby", function (_data)
    {
        throttleSocket(socket);
        if (_data)
        {
            if (typeof _data === "string")
            {
                joinLobbyByGameModeId(socket, _data, false);
            }
            else
            {
                joinLobbyByGameModeId(socket, _data.gameModeId, _data.bBattlezone);
            }
        }
    });

    socket.on("joinLobbyById", function (_lobbyId)
    {
        throttleSocket(socket);
        joinLobbyById(socket, _lobbyId);
    })

    socket.on("createParty", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to create party");
        createParty(socket);
    });

    socket.on("createPrivateLobby", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to create private lobby");
        if (!validateClient(socket))
        {
            return;
        }
        var currentLobbyId = socket.player.currentLobbyId;
        if (currentLobbyId)
        {
            removeSocketPlayerFromLobby(socket, "create_private_lobby");
            return;
        }
        var currentPartyId = socket.player.currentPartyId;
        if (currentPartyId)
        {
            var party = getParty(currentPartyId);
            if (party)
            {
                if (getSocketPlayerId(socket) != party.hostPlayerId)
                {
                    return;
                }
            }
        }
        if (lobbies["private"].length < serverSettings.maxCustomLobbies)
        {
            var newLobbyId = "L-" + getRandomUniqueId();
            createPrivateLobby(newLobbyId);
            var party = getParty(socket.player.currentPartyId);
            if (party)
            {
                for (i = 0; i < party.players.length; i++)
                {
                    var partySocket = getSocketByPlayerId(party.players[i]["id"]);
                    if (canJoinLobby(newLobbyId, partySocket) == Lobby.JOIN_SUCCESS)
                    {
                        joinLobby(newLobbyId, partySocket);
                    }
                }
            }
            else
            {
                joinLobby(newLobbyId, socket);
                sendChatMessage(null, {
                    bServer: true,
                    messageText: socket.player.name + " created a new custom lobby."
                });
            }
        }
        else
        {
            socket.emit("showWindow", {
                titleText: "STR_ERROR",
                messageText: "STR_CUSTOM_LOBBY_MAX_CAPACITY_DESC",
                bShowOkayButton: true
            });
        }
    });

    socket.on("changePrivateGameSettings", function (_data)
    {
        throttleSocket(socket);
        if (!socket.player)
        {
            disconnectSocket(socket, { reason: "Error" } );
            return;
        }
        log(tracePlayer(socket), "Wants to change private game settings", chalk.bgCyan(socket.player.currentLobbyId));
        log(_data);
        if (!_data)
        {
            return;
        }
        var lobbyData = getLobbyData(socket.player.currentLobbyId);
        if (lobbyData)
        {
            if (lobbyData.hostPlayerId != getSocketPlayerId(socket))
            {
                disconnectSocket(socket, { reason: "kicked" });
                return;
            }
            if (lobbyData["bPrivate"])
            {
                var lobbyId = lobbyData.id;
                //Validate new keys to make sure they can't corrupt the lobby
                var gameData = lobbyData.gameData;
                var prevDebug = gameData.settings["bDebug"];
                var prevPrivate = gameData.settings["bPrivate"];
                var prevBots = gameData.settings["bots"];
                var prevBotSkill = gameData.settings["botSkill"];
                var prevBotTeam = gameData.settings["botTeam"];
                var prevDifficulty = gameData.settings["difficulty"];
                var keys = Object.keys(_data);
                for (var i = 0; i < keys.length; i++)
                {
                    var key = keys[i];
                    if (_data["bSettings"])
                    {
                        if (key !== "bSettings")
                        {
                            var value = _data[key];
                            switch (key)
                            {
                                case "bDebug":
                                    log("Setting private game debug:", value);
                                    break;

                                case "botTeam":
                                    value = Math.max(-1, Math.min(1, value));
                                    break;

                                case "botSkill":
                                    value = Math.max(-1, Math.min(4, value));
                                    break;

                                case "bots":
                                    value = Math.max(0, value);
                                    break;

                                case "timeLimit":
                                    value = Math.max(1, value);
                                    break;

                                case "respawnTime":
                                    value = Math.max(1, value);
                                    break;

                                case "scoreLimit":
                                    value = Math.max(1, value);
                                    break;

                                case "bombTimerMax":
                                    value = Math.max(1, value);
                                    break;
                            }
                            gameData.settings[key] = value;
                        }
                    }
                    else
                    {
                        gameData[key] = _data[key];
                        if (key == "gameModeId")
                        {                            
                            delete gameData["operation"];
                            delete gameData["operationId"];
                            delete gameData["bSurvival"];
                            delete gameData["bOperation"];
                            delete gameData["bSandbox"];
                            lobbyData["gameModeId"] = _data[key];
                            gameData.settings = getDefaultGameModeSettings(_data[key]);
                            gameData.settings["bAutoBalance"] = false;
                            gameData.settings["bDebug"] = prevDebug;
                            gameData.settings["bPrivate"] = prevPrivate != null ? prevPrivate : true;
                            gameData.settings["bots"] = prevBots;
                            gameData.settings["botSkill"] = prevBotSkill;
                            gameData.settings["botTeam"] = prevBotTeam;
                            switch (_data[key])
                            {
                                case GameMode.BATTLEZONE:
                                    gameData["bBattlezone"] = true;
                                    gameData["bRanked"] = true;
                                    gameData.settings["bots"] = 0;
                                    break;

                                case GameMode.SANDBOX:
                                    gameData["bRanked"] = false;
                                    gameData["bSandbox"] = true;
                                    gameData.settings["bots"] = 0;
                                    break;

                                case GameMode.SURVIVAL_BASIC:
                                case GameMode.SURVIVAL_CHAOS:
                                case GameMode.SURVIVAL_UNDEAD:
                                case GameMode.SURVIVAL_STAKEOUT:
                                case GameMode.SURVIVAL_PRO:
                                    gameData["bRanked"] = false;
                                    gameData["bSurvival"] = true;
                                    gameData.settings["bots"] = 0;
                                    break;

                                case GameMode.OPERATION:
                                    gameData["operationId"] = "op_riverside_assault";
                                    gameData["bRanked"] = true;
                                    gameData.settings["bots"] = 0;
                                    gameData.settings["difficulty"] = prevDifficulty ? prevDifficulty : 1;
                                    break;

                                default:
                                    gameData["bRanked"] = true;
                                    break;
                            }
                            log("Loaded default game mode settings");
                            lobbyData["bTeamSelection"] = isTeamGameMode(gameData["gameModeId"]);
                        }
                    }
                }
                log("Updated", keys.length, "keys");
                if (lobbyData.game)
                {
                    console.warn("Game exists in private lobby while updating settings!");
                    return;
                }
                io.sockets.in(lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
            }
        }
    });

    socket.on("startPrivateGame", function ()
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to start private game");
        var lobbyData = getLobbyData(socket.player.currentLobbyId);
        if (lobbyData)
        {
            if (lobbyData.hostPlayerId != getSocketPlayerId(socket))
            {
                return;
            }
            var lobbyId = lobbyData.id;
            if (lobbyData["bPrivate"])
            {
                if (lobbyData["state"] === LobbyState.STARTING)
                {
                    setLobbyState(lobbyId, LobbyState.WAITING_HOST);
                    io.sockets.in(lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
                }
                else
                {
                    var numPlayers = lobbyData["players"].length;
                    var minPlayers = 1; //lobbyData.gameData.settings["bDebug"] ? 1 : 2;
                    var maxPlayers = lobbyData.gameData.settings["bDebug"] ? Lobby.MAX_PLAYERS : shared["maxPlayers"][lobbyData["gameModeId"]];
                    if (numPlayers > maxPlayers)
                    {
                        socket.emit("showWindow", {
                            titleText: "STR_TOO_MANY_PLAYERS",
                            messageText: "STR_TOO_MANY_PLAYERS_DESC",
                            messageParams: [maxPlayers],
                            bShowOkayButton: true
                        });
                    }
                    else if (numPlayers < minPlayers)
                    {
                        socket.emit("showWindow", {
                            titleText: "STR_NOT_ENOUGH_PLAYERS",
                            messageText: "STR_NOT_ENOUGH_PLAYERS_DESC",
                            bShowOkayButton: true
                        });
                    }
                    else if (!verifyPrivateLobbyTeams(lobbyData))
                    {
                        socket.emit("showWindow", {
                            titleText: "STR_INVALID_TEAMS",
                            messageText: "STR_INVALID_TEAMS_DESC",
                            bShowOkayButton: true
                        });
                    }
                    else
                    {
                        if (lobbyData["state"] === LobbyState.WAITING_HOST)
                        {
                            setLobbyState(lobbyId, LobbyState.STARTING);
                            if (!intervals[lobbyId])
                            {
                                lobbyData["timer"] = Lobby.COUNTDOWN_STARTING_PRIVATE;
                                intervals[lobbyId] = setInterval(onLobbyTimer, 1000, lobbyId);
                            }
                            io.sockets.in(lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
                        }
                    }
                }
            }
            else
            {
                log(chalk.red("Insufficient permissions"));
            }
        }
    });

    socket.on("setPrivatePlayerTeam", function (_id, _team)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to set private player team", tracePlayer(getSocketByPlayerId(_id)), _team);
        var lobbyData = getLobbyData(socket.player.currentLobbyId);
        if (lobbyData)
        {
            if (lobbyData.hostPlayerId != getSocketPlayerId(socket))
            {
                return;
            }
            if (lobbyData["bPrivate"])
            {
                var player = getLobbyPlayerById(lobbyData["id"], _id);
                if (player)
                {
                    if (_team >= 0)
                    {
                        player["desiredTeam"] = Math.min(_team, 1);
                    }
                    else
                    {
                        delete player["desiredTeam"];
                    }
                    io.sockets.in(lobbyData["id"]).emit("updateLobby", {
                        players: lobbyData.players
                    });
                }
            }
            else
            {
                log(chalk.red("Insufficient permissions"));
            }
        }
    });

    socket.on("kickPrivatePlayer", function (_id)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to kick private player", _id);
        var party = getParty(socket.player.currentPartyId);
        if (party)
        {
            if (party.hostPlayerId == getSocketPlayerId(socket))
            {
                var kickSocket = getSocketByPlayerId(_id);
                if (kickSocket)
                {
                    removePlayerFromParty(kickSocket);
                    removeSocketPlayerFromLobby(kickSocket, "kicked")
                }
            }
            else
            {
                return;
            }
        }
        else
        {
            var lobbyData = getLobbyData(socket.player.currentLobbyId);
            if (lobbyData)
            {
                if (lobbyData["bPrivate"] && lobbyData.hostPlayerId == getSocketPlayerId(socket))
                {
                    var kickSocket = getSocketByPlayerId(_id);
                    if (kickSocket)
                    {
                        removeSocketPlayerFromLobby(kickSocket, "kicked");
                    }
                }
                else
                {
                    return;
                }
            }
        }
    });

    socket.on("kickClanPlayer", function (_id)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Wants to kick clan player", _id);
        if (socket.player.clan && socket.player.bClanLeader)
        {
            var kicked = getSocketByPlayerId(_id);
            if (kicked)
            {
                log("Kicking socket player...");
                async_leaveClanBySocket(kicked);
            }
            else
            {
                log("Kicking by username...");
                async_leaveClanByUsername(socket, _id);
            }
        }
    });

    socket.on("joinPrivateLobby", function (_id)
    {
        throttleSocket(socket);
        if (!socket.player)
        {
            return;
        }
        log(tracePlayer(socket), "Wants to join private lobby", chalk.bgCyan(_id));        
        var currentLobbyId = socket.player.currentLobbyId;
        if (currentLobbyId)
        {
            removeSocketPlayerFromLobby(socket, "joining_private_lobby");
            return;
        }
        var lobbyData = getLobbyData(_id);
        if (lobbyData)
        {
            var lobbyId = lobbyData["id"];
            var result = canJoinLobby(lobbyId, socket);
            switch (result)
            {
                case Lobby.JOIN_SUCCESS:
                    var party = getParty(socket.player.currentPartyId);
                    if (party)
                    {
                        for (var i = 0; i < party.players.length; i++)
                        {
                            var partySocket = getSocketByPlayerId(party.players[i]["id"]);
                            if (canJoinLobby(lobbyId, partySocket) == Lobby.JOIN_SUCCESS)
                            {
                                joinLobby(lobbyId, partySocket);
                            }
                        }
                    }
                    else
                    {
                        joinLobby(lobbyId, socket);
                    }
                    break;

                case Lobby.JOIN_FAIL_LOCKED:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_CUSTOM_LOBBY_LOCKED_DESC",
                        bShowOkayButton: true
                    });
                    break;

                case Lobby.JOIN_FAIL_CAPACITY:
                    socket.emit("showWindow", {
                        titleText: "STR_ERROR",
                        messageText: "STR_CUSTOM_LOBBY_MAX_CAPACITY_DESC",
                        bShowOkayButton: true
                    });
                    break;
            }
        }
        else
        {
            socket.emit("showWindow", {
                titleText: "STR_ERROR",
                messageText: "STR_CUSTOM_LOBBY_NON_EXISTANT_DESC",
                messageParams: [_id],
                highlights: [_id],
                bShowOkayButton: true
            });
        }
    });

    socket.on("votekick", function (_playerId)
    {
        throttleSocket(socket);
        if (!serverSettings.bAllowVotekick)
        {
            return;
        }
        log(tracePlayer(socket), "wants to votekick player", tracePlayer(getSocketByPlayerId(_playerId)));
        if (_playerId)
        {
            if (socket.player && socket.player.currentLobbyId)
            {
                votekickPlayer(socket.player.currentLobbyId, socket.id, _playerId);
            }
        }
    });

    socket.on("sendLobbyChatMessage", function (_lobbyId, _message)
    {
        if (!socket.player)
        {
            return;
        }
        //TODO: Deprecated _lobbyId parameter
        throttleSocket(socket);
        if (_message)
        {
            var message = _message.replace(/<(?:.|\n)*?>/gm, '');  
            if (message.length == 0)
            {
                return;
            }
            var lobbyId = socket.player.currentLobbyId;           
            message = smile.checkText(message);
            chatLimiter.consume(socket.id).
                then(() =>
                {
                    log(tracePlayer(socket), chalk.cyan("<Chat: " + (lobbyId ? lobbyId : "Global") + ">"), message);
                    var split = message.split(" ");
                    switch (split[0])
                    {
                        default:
                            var msg = message.toLowerCase();
                            var sendLobbyId = null;
                            var lobbies = getAllLobbies();
                            for (var i = 0; i < lobbies.length; i++)
                            {
                                let lobby = lobbies[i];
                                if (msg.indexOf(lobby.id.toLowerCase()) >= 0)
                                {
                                    sendLobbyId = lobby.id;
                                    break;
                                }
                            }
                            var partyId = null;
                            if (!sendLobbyId)
                            {
                                var keys = Object.keys(parties);
                                for (var i = 0; i < keys.length; i++)
                                {
                                    let party = parties[keys[i]];
                                    if (msg.indexOf(party.id.toLowerCase()) >= 0)
                                    {
                                        partyId = party.id;
                                    }
                                }
                            }
                            sendChatMessage(lobbyId, {
                                playerId: socket.player.id,
                                currentPartyId: socket.player.currentPartyId,
                                bAdmin: socket.player.bAdmin,
                                bClanLeader: socket.player.bClanLeader,
                                playerText: socket.player["name"],
                                clan: socket.player.clan,
                                messageText: message,
                                lobbyId: sendLobbyId,
                                partyId: partyId
                            });
                            break;
                    }     
                }).
                catch(r =>
                {
                    //console.warn(tracePlayer(socket), "Exceeded chat limit!", message, r);
                    sendChatMessageToSocket(socket.id, {
                        messageText: "You've sent too many messages."
                        //locText: "STR_TOO_MANY_MESSAGES"
                    });
                });
        }
    });

    socket.on("setLobbyMapVote", function (_lobbyId, _mapId)
    {
        throttleSocket(socket);
        log(tracePlayer(socket), "Map vote", chalk.yellow(_mapId));
        var lobbyData = getLobbyData(_lobbyId);
        if (lobbyData)
        {
            var maps = lobbyData["maps"];
            if (maps)
            {
                for (var i = 0; i < maps.length; i++)
                {
                    var mapData = maps[i];
                    var votes = mapData["votes"];
                    var voteIndex = votes.indexOf(getSocketPlayerId(socket));
                    if (voteIndex >= 0)
                    {
                        votes.splice(voteIndex, 1);
                    }
                    else if (mapData["id"] == _mapId)
                    {
                        votes.push(getSocketPlayerId(socket));
                    }
                }
                io.sockets.in(_lobbyId).emit("updateLobby", {
                    timer: lobbyData["timer"],
                    maps: lobbyData["maps"]
                });
            }
            else
            {
                console.warn("Invalid maps reference", lobbyData);
            }
        }
    });

    socket.on("leaveLobby", function ()
    {
        throttleSocket(socket);
        if (!socket.player)
        {
            return;
        }
        var lobbyId = socket.player.currentLobbyId;        
        if (lobbyId)
        {
            log(tracePlayer(socket), "Wants to leave lobby", chalk.bgCyan(lobbyId));
            var lobbyData = getLobbyData(lobbyId);
            if (lobbyData)
            {
                var party = getParty(socket.player.currentPartyId);
                if (party)
                {
                    if (party["hostPlayerId"] == getSocketPlayerId(socket))
                    {
                        for (var i = 0; i < party.players.length; i++)
                        {
                            var curSocket = getSocketByPlayerId(party.players[i]["id"]);
                            removeSocketPlayerFromLobby(curSocket, "party_host_leave");
                        }
                    }
                    else
                    {
                        removePlayerFromParty(socket);
                        removeSocketPlayerFromLobby(socket, "leave");
                    }
                }
                else
                {
                    removeSocketPlayerFromLobby(socket, "leave");
                }
            }
            else
            {
                console.warn("socket.on(leaveLobby) --> Lobby doesn't exist:", socket.player.currentLobbyId);
                if (socket.player.currentLobbyId)
                {
                    removeSocketPlayerFromLobby(socket, "leave");
                }
            }
        }
    });

    socket.on("getLobbyData", function (_lobbyId)
    {
        throttleSocket(socket);
        var lobbyData = getSafeLobbyDataById(_lobbyId);
        socket.emit("getLobbyData", lobbyData);
    }); 

    socket.on("getServerData", function ()
    {
        throttleSocket(socket);
        socket.emit("getServerData", getLatestServerData());
    }); 

    socket.on("getCurrentLobbyData", function ()
    {
        throttleSocket(socket);
        var lobbyData = getLobbyData(socket.player.currentLobbyId);
        if (lobbyData)
        {
            socket.emit("updateLobby", getSafeLobbyData(lobbyData));
        }
    });

    socket.on("disconnect", function ()
    {
        var lobbyId = socket.player.currentLobbyId;
        if (lobbyId)
        {
            removeSocketPlayerFromLobby(socket, "disconnect");
        }
        var partyId = socket.player.currentPartyId;
        if (partyId)
        {
            removePlayerFromParty(socket);
        }        
        log(tracePlayer(socket), chalk.red("Disconnected"), "|", getNumClients(), "connected");
        delete socket.player;
        delete socket.info;
        broadcastServerData();
    });
});

function removePlayerFromLobby(_lobbyId, _playerId, _reason)
{

}

function removeSocketPlayerFromLobby(_socket, _reason)
{
    var currentLobbyId = _socket.player.currentLobbyId;
    if (currentLobbyId)
    {
        log(chalk.bgCyan(currentLobbyId), "Remove socket:", tracePlayer(_socket), "| Reason:", _reason);
        _socket.leave(currentLobbyId);
        _socket.emit("leaveLobby", _reason);
        var lobbyData = getLobbyData(currentLobbyId);
        if (lobbyData)
        {
            var requiredPlayers = lobbyData["minPlayers"]; //lobbyData["gameModeId"] == GameMode.BATTLEZONE ? 1 : 2;
            retractLobbyMapVote(getSocketPlayerId(_socket), currentLobbyId);
            var lobbyPlayers = lobbyData["players"];
            for (var i = lobbyPlayers.length - 1; i >= 0; i--)
            {
                let curPlayer = lobbyPlayers[i];
                if (curPlayer["id"] == getSocketPlayerId(_socket))
                {
                    resetPlayer(curPlayer);
                    lobbyPlayers.splice(i, 1);
                    break;
                }
            }
            var game = lobbyData["game"];
            if (game)
            {
                game.requestEvent({
                    eventId: GameServer.EVENT_PLAYER_LEAVE,
                    reason: _reason,
                    playerId: getSocketPlayerId(_socket)
                });

                //Add bot to replace player that left
                if (lobbyData["bAddBots"])
                {
                    var bot = getBotPlayerForLobby(lobbyData);
                    if (bot)
                    {
                        initPlayerForGameInProgress(bot, lobbyData["id"]);
                        lobbyData.players.push(bot);
                        var clonedBot = clone(bot);
                        game.addPlayer(clonedBot);
                    }
                }
            }
            var numPlayers = lobbyPlayers.length - getNumBotsInLobby(currentLobbyId);
            if (lobbyData["state"] === LobbyState.IN_PROGRESS)
            {                
                if (numPlayers < requiredPlayers)
                {
                    if (game)
                    {
                        if (!lobbyData.gameData["bSandbox"])
                        {
                            log(chalk.bgCyan(currentLobbyId), "Not enough players in game:", numPlayers);
                            if (lobbyData.gameData["bSurvival"] || lobbyData.gameData["bOperation"])
                            {
                                game.requestEvent({
                                    eventId: GameServer.EVENT_GAME_END,
                                    result: MatchState.END_RESULT_LOSS,
                                    condition: MatchState.END_CONDITION_FORFEIT
                                });
                            }
                            else
                            {
                                game.requestEvent({
                                    eventId: GameServer.EVENT_GAME_END,
                                    result: MatchState.END_RESULT_WIN,
                                    condition: MatchState.END_CONDITION_FORFEIT
                                });
                            }
                        }
                    }
                    if (numPlayers == 0)
                    {
                        log("Lobby is empty, reset state");
                        resetMapVotes(lobbyData["id"]);
                        setLobbyState(lobbyData["id"], LobbyState.WAITING);
                    }
                    broadcastServerData();
                }
                else if (requiredPlayers > 1)
                {
                    //Make sure both teams have players
                    if (game)
                    {
                        if (isTeamGameMode(lobbyData["gameModeId"]))
                        {
                            var players = lobbyData.players;
                            var teams = [0, 0];
                            for (var i = 0; i < players.length; i++)
                            {
                                var player = players[i];
                                if (player.team >= 0)
                                {
                                    teams[player.team]++;
                                }
                            }
                            if (teams[0] == 0 || teams[1] == 0)
                            {
                                game.requestEvent({
                                    eventId: GameServer.EVENT_GAME_END,
                                    result: MatchState.END_RESULT_WIN,
                                    condition: MatchState.END_CONDITION_FORFEIT
                                });
                            }
                        }
                    }
                }
            }
            else
            {
                checkLobbyReady(currentLobbyId);
                sendChatMessage(currentLobbyId, {
                    messageText: (_socket.player ? _socket.player.name : "Player") + (_reason == "kicked" ? " was kicked" : " left"),
                    locText: _reason == "kicked" ? "STR_X_WAS_KICKED_LOBBY" : "STR_X_LEFT_LOBBY",
                    params: [_socket.player ? _socket.player.name : "Player"]
                });
                var requiredPlayers = lobbyData["gameModeId"] == GameMode.BATTLEZONE ? 1 : 2;
                if (lobbyData["bPrivate"] && lobbyData["state"] === LobbyState.STARTING)
                {
                    setLobbyState(currentLobbyId, LobbyState.WAITING_HOST);
                }
                else if (numPlayers < requiredPlayers)
                {
                    resetMapVotes(currentLobbyId);
                    if (numPlayers === 0 || lobbyData["state"] !== LobbyState.INTERMISSION)
                    {
                        var desiredState = lobbyData["bPrivate"] ? LobbyState.WAITING_HOST : LobbyState.WAITING;
                        if (lobbyData["state"] !== desiredState)
                        {
                            setLobbyState(currentLobbyId, desiredState);
                        }
                    }
                }
                io.sockets.in(currentLobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
            }

            switch (_reason)
            {
                case "kicked":
                    removePlayerFromParty(_socket);
                    _socket.emit("showWindow", {
                        titleText: "STR_PLAYER_KICKED",
                        messageText: "STR_PLAYER_KICKED_HOST_DESC",
                        bShowOkayButton: true
                    });
                    break;

                case "latency":
                    _socket.emit("showWindow", {
                        titleText: "STR_PLAYER_KICKED",
                        messageText: "STR_PLAYER_KICKED_LATENCY_DESC",
                        bShowOkayButton: true
                    });
                    break;

                case "idle":
                    _socket.emit("showWindow", {
                        titleText: "STR_PLAYER_KICKED",
                        messageText: "STR_PLAYER_KICKED_IDLE_DESC",
                        bShowOkayButton: true
                    });
                    break;
            }

            if (lobbyData["bPrivate"])
            {
                if (getSocketPlayerId(_socket) == lobbyData.hostPlayerId)
                {
                    log(chalk.yellow("Host has left the lobby!"));
                    if (!_socket.player.currentPartyId)
                    {
                        io.sockets.in(currentLobbyId).emit("showWindow", {
                            titleText: "STR_CUSTOM_LOBBY_DISBANDED",
                            messageText: "STR_HOST_LEFT_DESC",
                            bShowOkayButton: true
                        });
                    }
                    removeLobby(lobbyData["id"]);
                }
            }
            else
            {
                if (numPlayers === 0)
                {
                    var useId = lobbyData["rotationId"] ? lobbyData["rotationId"] : lobbyData["gameModeId"];
                    var arr = lobbies[useId];
                    if (arr)
                    {
                        var index = arr.indexOf(lobbyData);
                        if (index > 0)
                        {
                            removeLobby(lobbyData["id"]);
                        }
                    }
                }
            }
        }        
    } 
    if (_socket && _socket.player)
    {
        delete _socket.player.bLobbyHost;
        delete _socket.player.team;
        delete _socket.player.currentLobbyId;
    }
}

function broadcastServerData()
{
    var players = getAllPlayers();
    for (var i = 0; i < players.length; i++)
    {
        var socket = getSocketByPlayerId(players[i]["id"]);
        if (socket && socket.player && !socket.player.currentLobbyId)
        {
            socket.emit("updateServerStats", getLatestServerData());
        }
    }
}

function initLobbies()
{
    var rotations = [
        GameMode.COMBAT_TRAINING,
        GameMode.GROUND_WAR,
        GameMode.ROTATION_COMMUNITY,
        GameMode.ROTATION_SURVIVAL,
        GameMode.HARDCORE
    ];
    for (var i = 0; i < rotations.length; i++)
    {
        var curId = rotations[i];
        lobbies[curId] = [];
        createRotationLobby(curId);
    }
    var gameModes = [
        GameMode.BATTLEZONE,
        GameMode.DEATHMATCH,
        GameMode.TEAM_DEATHMATCH,
        GameMode.DOMINATION,
        GameMode.CAPTURE_THE_FLAG,
        GameMode.DEFENDER,
        GameMode.DEMOLITION,
        GameMode.HEADQUARTERS,
        GameMode.GUN_GAME,
        GameMode.INFECTED,
        GameMode.SURVIVAL_UNDEAD,
        GameMode.SURVIVAL_BASIC,
        GameMode.SURVIVAL_CHAOS,
        GameMode.SURVIVAL_STAKEOUT,
        GameMode.SURVIVAL_PRO
    ];
    for (var i = 0; i < gameModes.length; i++)
    {
        var curId = gameModes[i];
        lobbies[curId] = [];
        createPublicLobby(curId);
    }
    lobbies["private"] = [];
}

function createRotationLobby(_gameModeId)
{
    log("Create rotation lobby:", chalk.cyan(_gameModeId));
    var bRanked = true;
    var bSurvival = false;
    var minPlayers = 2;
    var maxPlayers = shared["maxPlayers"][_gameModeId];
    switch (_gameModeId)
    {
        case GameMode.ROTATION_SURVIVAL:
            minPlayers = 1;
            bRanked = false;
            bSurvival = true;
            break;

        case GameMode.GROUND_WAR:
        case GameMode.COMBAT_TRAINING:
            var bAddBots = true;
            minPlayers = 1;
            break;

        case GameMode.HARDCORE:
            var bHardcore = true;
            minPlayers = 2;
            break;

        default:
            minPlayers = 2;
            break;
    }
    var id = getRandomUniqueId(); // _gameModeId + lobbies[_gameModeId].length;
    var rotationModes = shared.rotations[_gameModeId];
    var maps = getRandomLobbyMaps(_gameModeId, rotationModes);
    var useMode = maps[0]["gameModeId"];
    var settings = getDefaultGameModeSettings(useMode);
    var gameData = {
        lobbyId: id,
        bMultiplayer: true,        
        gameModeId: useMode,
        mapId: Map.RIVERSIDE,
        settings: settings,
        maxPlayers: maxPlayers,
        bRanked: bRanked,
        bSurvival: bSurvival
    };
    var lobby = {
        id: id,
        rotationId: _gameModeId,
        rotationModes: rotationModes,
        gameModeId: useMode,
        gameData: gameData,
        minPlayers: minPlayers,
        maxPlayers: maxPlayers,
        players: [],
        maps: maps,
        state: LobbyState.WAITING,
        timer: -1,
        bLocked: false,
        bAddBots: bAddBots,
        bHardcore: bHardcore
    };
    lobbies[_gameModeId].push(lobby);
    return lobby;
}

function createPublicLobby(_gameModeId)
{
    log("Create public lobby:", chalk.cyan(_gameModeId));
    var bRanked = true;
    var bSurvival = false;
    var minPlayers = 2;
    var maxPlayers = shared["maxPlayers"][_gameModeId];    
    switch (_gameModeId)
    {
        case GameMode.SURVIVAL_BASIC:
        case GameMode.SURVIVAL_CHAOS:
        case GameMode.SURVIVAL_UNDEAD:
        case GameMode.SURVIVAL_STAKEOUT:
        case GameMode.SURVIVAL_PRO:
            minPlayers = 2;
            bRanked = false;
            bSurvival = true;
            break;

        case GameMode.GUN_GAME:
        case GameMode.DEATHMATCH:
            minPlayers = 2;
            break;

        case GameMode.BATTLEZONE:
            minPlayers = 1;
            break;

        default:
            minPlayers = 2;
            break;
    }
    var id = getRandomUniqueId(); //_gameModeId + lobbies[_gameModeId].length;
    var maps = getRandomLobbyMaps(_gameModeId);
    var settings = getDefaultGameModeSettings(_gameModeId);
    settings.filterType = "random";
    var gameData = {
        lobbyId: id,
        bMultiplayer: true,
        gameModeId: _gameModeId,
        mapId: Map.RIVERSIDE,
        settings: settings,
        maxPlayers: maxPlayers,
        bRanked: bRanked,
        bSurvival: bSurvival
    };
    var lobby = {
        id: id,
        gameModeId: _gameModeId,
        gameData: gameData,
        minPlayers: minPlayers,
        maxPlayers: maxPlayers,
        players: [],
        maps: maps,
        state: LobbyState.WAITING,
        timer: -1,
        bLocked: false
    };
    lobbies[_gameModeId].push(lobby);
    return lobby;
}

function getRandomLobbyMaps(_gameModeId, _rotationModes)
{
    var bAddRandom = true;
    switch (_gameModeId)
    {
        case GameMode.BATTLEZONE:
            var maps = [
                Map.DOWNTURN,
                Map.SANDSTORM,
                Map.OVERGROWN,
                Map.AIRPORT,
                Map.DOWNTURN_EXTENDED
            ];
            shuffleArray(maps);
            maps.splice(0, 1);
            bAddRandom = false;
            break;
        default:
            maps = [
                Map.RIVERSIDE,
                Map.DISTRICT,
                Map.WAREHOUSE,
                Map.OUTPOST,
                Map.ESTATE,
                Map.FACTORY,
                Map.DOWNTURN,
                Map.SANDSTORM,
                Map.OVERGROWN,
                Map.AIRPORT
            ];
            break;
    }    
    shuffleArray(maps);
    if (_rotationModes)
    {
        shuffleArray(_rotationModes);
    }
    var arr = [];
    for (var i = 0; i < (bAddRandom ? 2 : maps.length); i++)
    {
        arr.push({
            id: maps[i],
            votes: [],
            gameModeId: _rotationModes ? _rotationModes[i] : null
        });
    }
    if (bAddRandom)
    {
        arr.push({
            id: Map.RANDOM,
            votes: [],
            gameModeId: _rotationModes ? _rotationModes[i] : null
        });
    }
    return arr;
}

function getNumRealPlayersInLobby(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var numPlayers = 0;
        var players = lobbyData.players;
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (!player.bBot || player.bDummy)
            {
                numPlayers++;
            }
        }
        return numPlayers;
    }
    return 0;
}

function getNumRealTeamPlayersInLobby(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var numPlayers = 0;
        var parties = {};
        var players = lobbyData.players;
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (!player.bBot || player.bDummy)
            {
                if (player.currentPartyId)
                {
                    if (!parties[player.currentPartyId])
                    {
                        numPlayers++;
                    }
                    parties[player.currentPartyId] = true;
                }
                else
                {
                    numPlayers++;
                }
            }
        }
        return numPlayers;
    }
    return 0;
}

function removeBotsFromLobby(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var players = lobbyData.players;
        var num = 0;
        for (var i = players.length - 1; i >= 0; i--)
        {
            var player = players[i];
            if (player.bBot && !player.bDummy)
            {
                players.splice(i, 1);
                num++;
            }
        }
        if (num > 0)
        {
            log("Removed", num, "bots from", chalk.bgCyan(_lobbyId));
        }
    }
}

function getNumBotsInLobby(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var numBots = 0;
        var players = lobbyData.players;
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (player.bBot && !player.bDummy)
            {
                numBots++;
            }
        }
        return numBots;
    }
    return 0;
}

function getNumDummiesInLobby(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var numDummies = 0;
        var players = lobbyData.players;
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (player.bDummy)
            {
                numDummies++;
            }
        }
        return numDummies;
    }
    return 0;
}

function removeLobby(_id)
{
    log("Removing lobby: " + chalk.bgCyan(_id));
    var lobbyData = getLobbyData(_id);
    if (lobbyData)
    {
        if (lobbyData["bPendingDestroy"])
        {
            log("Lobby is already destroyed");
            return;
        }
        var players = clone(lobbyData["players"]);
        for (var i = players.length - 1; i >= 0; i--)
        {
            let curPlayer = players[i];
            if (curPlayer)
            {
                var socket = getSocketByPlayerId(curPlayer["id"]);
                if (socket)
                {
                    removeSocketPlayerFromLobby(socket, "lobby_removed");
                }
            }
            else
            {
                console.warn(i, _id, "Invalid player in lobby:", curPlayer);
            }
        }
        destroyLobbyGame(lobbyData);
        if (lobbyData["bPrivate"])
        {
            var index = lobbies.private.indexOf(lobbyData);
            if (index >= 0)
            {
                lobbies.private.splice(index, 1);
            }
        }
        else
        {
            var gameModeId = lobbyData["rotationId"] ? lobbyData["rotationId"] : lobbyData["gameModeId"];
            if (gameModeId)
            {
                var index = lobbies[gameModeId].indexOf(lobbyData);
                if (index >= 0)
                {
                    lobbies[gameModeId].splice(index, 1);
                }
            }
        }
        var keys = Object.keys(lobbyData);
        for (var i = 0; i < keys.length; i++)
        {
            delete lobbyData[keys[i]];
        }
        lobbyData["bPendingDestroy"] = true;
        broadcastServerData();
    }
}

function createPrivateLobby(_id)
{
    log("Create private lobby: " + chalk.bgCyan(_id));
    var lobby = getLobbyData(_id);
    if (lobby)
    {
        log("Lobby already exists!");
    }
    else
    {
        var defaultGameModeId = GameMode.DEATHMATCH;
        var settings = getDefaultGameModeSettings(defaultGameModeId);
        settings["bots"] = 0;
        settings["botSkill"] = -1;
        settings["bPrivate"] = true;
        var gameData = {
            lobbyId: _id,
            gameModeId: defaultGameModeId,
            bMultiplayer: true,
            bRanked: true,
            mapId: Map.RANDOM,
            settings: settings
        };
        var newLobby = {
            id: _id,
            bPrivate: true,
            gameModeId: defaultGameModeId,
            gameData: gameData,
            maxPlayers: Lobby.MAX_PLAYERS,
            players: [],
            state: LobbyState.WAITING_HOST,
            timer: -1,
            bLocked: false
        };
        lobbies["private"].push(newLobby);
        broadcastServerData();        
    }
}

function getDefaultGameModeSettings(_gameModeId)
{
    var defaults = shared["defaultGameSettings"];
    var settings = defaults[_gameModeId];
    if (settings)
    {
        return clone(settings);
    }
    else
    {
        console.warn("Missing default settings:", _gameModeId);
        return {
            bKillstreaks: true,
            bAllowRespawns: true,
            bSpawnProtection: true,
            timeLimit: 10,
            respawnTime: 5
        };
    }
    return null;
}

function createParty(_socket)
{
    log("Creating party...");
    if (!_socket.player)
    {
        return;
    }
    var currentLobbyId = _socket.player.currentLobbyId;
    if (currentLobbyId)
    {
        removeSocketPlayerFromLobby(_socket, "create_party");
        return;
    }
    var partyId = "P-" + String(_socket.id).substr(0, 6);
    var party = getParty(partyId);
    if (party)
    {
        log(chalk.yellow("Party already exists!"));
        updatePartyClients(partyId);
        return;
    }
    var party = addParty(partyId);
    if (party)
    {
        joinParty(partyId, _socket);
        sendChatMessage(null, {
            bServer: true,
            messageText: _socket.player.name + " created a new party."
        });
    }
}

function addParty(_id)
{
    if (!getParty(_id))
    {
        log("Create party: " + chalk.bgCyan(_id));
        var party = {
            id: _id,
            hostPlayerId: null,
            players: []
        }
        parties[_id] = party;        
        return party;
    }
    else
    {
        log("Party already exists: " + _id);
    }
    return null;
}

function updatePartyClients(_partyId)
{
    var party = getParty(_partyId);
    if (party)
    {
        for (var i = 0; i < party.players.length; i++)
        {
            var player = party.players[i];
            var socket = getSocketByPlayerId(player["id"]);
            if (socket)
            {
                socket.emit("updateParty", party);
            }
        }
    }
}

function removePlayerFromParty(_socket)
{
    if (!_socket.player || !_socket.player.currentPartyId)
    {
        return;
    }
    log(chalk.bgCyan(_socket.player.currentPartyId), "Remove from party -->", tracePlayer(_socket)); 
    var party = getParty(_socket.player.currentPartyId);
    if (party)
    {
        for (var i = 0; i < party.players.length; i++)
        {
            if (party.players[i]["id"] == getSocketPlayerId(_socket))
            {
                party.players.splice(i, 1);
                break;
            }
        }
        if (party.players.length > 0)
        {
            updatePartyClients(party["id"]);
        }
        if (getSocketPlayerId(_socket) == party["hostPlayerId"])
        {
            removeParty(party.id);
        }
    }
    _socket.emit("leaveParty");
    if (_socket.player)
    {
        delete _socket.player.bPartyHost;
        delete _socket.player.currentPartyId;
    }
}

function removeParty(_id)
{
    log("Remove party:", chalk.bgCyan(_id));
    var partyData = parties[_id];
    if (partyData)
    {
        var players = partyData["players"];
        for (var i = players.length - 1; i >= 0; i--)
        {
            var socket = getSocketByPlayerId(players[i]["id"]);
            if (socket)
            {
                removePlayerFromParty(socket);
            }
        }
    }
    delete parties[_id];
}

function getParty(_id)
{
    if (!_id)
    {
        return null;
    }
    return parties[_id];
}

function getNumPlayersInParty(_id)
{
    var party = getParty(_id);
    if (party)
    {
        return party.players.length;
    }
    return 1;
}

function getAveragePlayerLevel(_players)
{
    if (!_players)
    {
        return 1;
    }
    var sum = 0;
    for (var i = 0; i < _players.length; i++)
    {
        var player = _players[i];
        if (player["prestige"] >= 1)
        {
            sum += 50;
        }
        else
        {
            sum += player["level"];
        }
    }
    return Math.round(sum / _players.length);
}

function getSafeLobbyDataById(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    return getSafeLobbyData(lobbyData);
}

function getSafeLobbyData(_lobbyData)
{
    var lobbyData = _lobbyData;
    var safeData = null;
    if (lobbyData)
    {
        safeData = {};
        var keys = Object.keys(lobbyData);
        for (var i = 0; i < keys.length; i++)
        {
            let key = keys[i];
            switch (key)
            {
                case "game":
                    //Ignore
                    break;

                default:
                    safeData[key] = lobbyData[key];
                    break;
            }
        }
    }
    return safeData;
}

function getLobbyData(_lobbyId)
{
    if (!_lobbyId)
    {
        return null;
    }
    var all = getAllLobbies();
    for (var i = 0; i < all.length; i++)
    {
        if (all[i]["id"] === _lobbyId)
        {
            return all[i];
        }
    }
    return null;
}

function getLobbyPlayerById(_lobbyId, _playerId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var players = lobbyData["players"];
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (player["id"] === _playerId)
            {
                return player;
            }
        }
    }
    return null;
}

function getPartyPlayerById(_partyId, _playerId)
{
    var party = getParty(_partyId);
    if (party)
    {
        var players = party["players"];
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];
            if (player["id"] === _playerId)
            {
                return player;
            }
        }
    }
    return null;
}

function getGame(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        return lobbyData["game"];
    }
    return null;
}

function joinParty(_partyId, _socket)
{
    var party = getParty(_partyId);
    if (party)
    {
        if (party.players.length == 0)
        {
            party["hostPlayerId"] = getSocketPlayerId(_socket);
            _socket.player["bPartyHost"] = true;
            log(chalk.bgCyan(_partyId), "Set host -->", tracePlayer(_socket));
        }
        else
        {
            if (party.players.indexOf(_socket.player) >= 0)
            {
                return;
            }
        }
        _socket.player.currentPartyId = _partyId;
        party.players.push(_socket.player);
        log("Party size:", party.players.length);
        updatePartyClients(_partyId);        
    }
}

function joinLobby(_lobbyId, _socket)
{    
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        if (_socket.player.currentLobbyId)
        {
            console.log(_lobbyId, tracePlayer(_socket), "already in lobby:", _socket.player.currentLobbyId);
            return;
        }
        _socket.player.currentLobbyId = _lobbyId;
        log(tracePlayer(_socket), "Joined lobby", chalk.bgCyan(_lobbyId));
        _socket.join(_lobbyId);
        _socket.info.autoJoinAttempts = 0;
        var player = _socket.player;
        var players = lobbyData["players"];
        var suffix = " (2)";
        var index = player.name.indexOf(suffix);
        if (index >= 0)
        {
            player.name = player.name.substring(0, index);
        }
        for (var i = 0; i < players.length; i++)
        {
            if (players[i].name === player.name)
            {
                player.name += suffix;
            }
        }
        players.push(player);
        if (lobbyData["bPrivate"])
        {
            if (players.length === 1)
            {
                lobbyData.hostPlayerId = _socket.player.id;
                player["bLobbyHost"] = true;
                player["desiredTeam"] = 0;
            }
            else
            {
                player["desiredTeam"] = players.length % 2 === 0 ? 1 : 0; //getBestTeam(lobbyData["players"]);
            }
        }
        if (lobbyData["game"])
        {
            joinGameInProgress(lobbyData, _socket);
        }
        else
        {
            _socket.emit("joinLobby", getSafeLobbyData(lobbyData));
            io.sockets.in(_lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
            sendChatMessage(_lobbyId, {
                messageText: player.name + " joined",
                clan: player.clan,
                locText: "STR_X_JOINED_LOBBY",
                params: [player.name]
            });
            checkLobbyReady(_lobbyId);
        }
    }
    else
    {
        console.warn("joinLobby --> Invalid lobby data:", _lobbyId)
    }
}

function joinGameInProgress(_lobbyData, _socket)
{
    //Join game in progress
    var lobbyData = _lobbyData;
    log("Joining game in progress");
    _socket.emit("joinLobby", {
        id: lobbyData["id"],
        gameModeId: _lobbyData.gameModeId,
        rotationId: _lobbyData.rotationId,
        bInProgress: true,
        bPrivate: lobbyData["bPrivate"],
        players: lobbyData["players"] //Need this to get lobby team
    });
    initPlayerForGameInProgress(_socket.player, lobbyData["id"]);
    var gameData = lobbyData.gameData;
    var startGameData = {
        bInProgress: true,
        bPrivate: lobbyData["bPrivate"],
        settings: gameData.settings,
        gameModeId: gameData.gameModeId,
        mapId: gameData.mapId,
        players: lobbyData["players"],
        bMultiplayer: true,
        bRanked: gameData.bRanked,
        bSurvival: gameData.bSurvival
    };
    onSocketStartGame(_socket.id, startGameData);    
}

function onSocketStartGame(_socketId, _data)
{
    var socket = getSocketById(_socketId);
    if (socket)
    {
        if (socket.player)
        {
            socket.emit("startGame", _data); //Pre-game menu
            setTimeout(() =>
            {
                onSocketEnterGame(_socketId);
            }, 3000);
        }
        else
        {
            console.warn("Invalid socket player data");
            socket.disconnect();
        }
    }
    else
    {
        //console.warn("Socket doesn't exist");
    }
}

function onSocketEnterGame(_socketId)
{
    var socket = getSocketById(_socketId);
    if (socket)
    {        
        if (socket.player)
        {
            socket.player["bReady"] = true;
            socket.emit("enterGame");
        }
        else
        {
            console.warn("Invalid socket player data");
            socket.disconnect();
        }
    }
    else
    {
        //console.warn("Socket doesn't exist");
    }
}

function getAvailableLobbyIndexForGameMode(_gameMode, _numPlayersToJoin = 1)
{
    var arr = lobbies[_gameMode];
    if (arr)
    {
        var tmp = arr.slice().sort(function (a, b)
        {
            if (a.players.length > b.players.length) return -1;
            if (a.players.length < b.players.length) return 1;
            return 0;
        });
        for (var i = 0; i < tmp.length; i++)
        {
            var lobby = tmp[i];
            var bCanAccept = !lobby["bLocked"] || lobbyCanAcceptPlayers(lobby["id"]);
            var numBots = getNumBotsInLobby(lobby["id"]);
            if (bCanAccept && ((lobby["players"].length + _numPlayersToJoin) - numBots) <= lobby["maxPlayers"] && !lobby["bMerging"])
            {
                return arr.indexOf(lobby);
            }
        }
    }
    return -1;
}

function genIdFromSocket(_socket)
{
    return _socket.id.substr(2, 6); //This has to match clientside ID
}

function tracePlayer(_socket)
{
    if (!_socket)
    {
        return null;
    }
    return chalk.bgMagenta(getSocketPlayerId(_socket)) + (_socket.player ? (" [" + chalk.yellow(_socket.player.name) + chalk.green(_socket.info.username ? ("@" + _socket.info.username) : "") + "]") : "");
}

function onLobbyAboutToStart(_lobby)
{
    if (_lobby && !_lobby["bPrivate"])
    {
        var players = _lobby["players"];
        if (players.length < _lobby["maxPlayers"])
        {
            Object.keys(io.sockets.connected).forEach(function (_socketId)
            {
                var socket = io.sockets.connected[_socketId];
                if (socket && socket.player && !socket.player.currentLobbyId)
                {
                    socket.emit("serverMessage", {
                        type: "game_starting",
                        lobbyId: _lobby["id"],
                        rotationId: _lobby["rotationId"],
                        gameModeId: _lobby["gameModeId"],
                        id: _lobby["id"]
                    });
                }
            });
        }
    }
}

function mergeLobbies(_lobby1, _lobby2)
{    
    if (_lobby1 && _lobby2)
    {
        log("Merging lobbies:", chalk.bgCyan(_lobby1.id), "-->", chalk.bgCyan(_lobby2.id));
        if (_lobby1["bPrivate"] || _lobby2["bPrivate"])
        {
            log("A lobby is private");
            return false;
        }
        if (_lobby1["bLocked"] || _lobby2["bLocked"])
        {
            log("A lobby is locked");
            return false;
        }
        if (_lobby1["bMerging"] || _lobby2["bMerging"])
        {
            log("A lobby is being merged");
            return false;
        }
        if (_lobby1["bPendingDestroy"] || _lobby2["bPendingDestroy"])
        {
            log("A lobby is destroyed");
            return false;
        }
        var combinedPlayers = _lobby1.players.length + _lobby2.players.length;
        log("Combined players:", combinedPlayers)
        if (combinedPlayers < 2)
        {
            log("Not enough players to merge");
            return false;
        }
        else if (combinedPlayers > _lobby1["maxPlayers"])
        {
            log("Not enough room to merge", combinedPlayers + "/" + _lobby1["maxPlayers"]);
            return false;
        }
        var newLobbyData = getLobbyData(_lobby1.id);
        var newLobbyId = newLobbyData ? newLobbyData.id : null;
        var lobby2Players = clone(_lobby2.players);
        if (newLobbyId && lobby2Players)
        {
            newLobbyData["bMerging"] = true;
            var numPlayers = lobby2Players.length;
            for (var i = numPlayers - 1; i >= 0; i--)
            {
                var lobby2Player = lobby2Players[i];
                var curSocket = lobby2Player ? getSocketByPlayerId(lobby2Player.id) : null;
                if (curSocket)
                {
                    var result = canJoinLobby(newLobbyId, curSocket);
                    switch (result)
                    {
                        case Lobby.JOIN_SUCCESS:
                            removeSocketPlayerFromLobby(curSocket, "merge");
                            joinLobby(newLobbyId, curSocket);
                            break;
                    }
                }
                else
                {
                    //console.warn("mergeLobbies --> Socket doesn't exist:", lobby2Player.id);
                    var index = lobby2Players.indexOf(lobby2Player);
                    if (index >= 0)
                    {
                        lobby2Players.splice(index, 1);
                    }
                }
            }
            log("Merged", numPlayers, "player" + (numPlayers == 1 ? "" : "s") + " into", chalk.bgCyan(newLobbyId));
            delete newLobbyData["bMerging"];
            return true;
        }
        else
        {
            console.warn("mergeLobbies --> Invalid lobby players:", _lobby2);
            return false;
        }
    }
    else
    {
        console.warn("Invalid lobby data while trying to merge:", _lobby1, _lobby2);
    }
    return false;
}

function joinLobbyById(_socket, _lobbyId)
{
    if (_socket)
    {
        log(tracePlayer(_socket), "Wants to join lobby by id", chalk.bgCyan(_lobbyId));
        var lobbyData = getLobbyData(_lobbyId);
        if (lobbyData)
        {
            if (lobbyData["bPrivate"] && lobbyData.gameData.settings["bPrivate"])
            {
                return;
            }
            var result = canJoinLobby(_lobbyId, _socket);
            switch (result)
            {
                case Lobby.JOIN_SUCCESS:
                    var party = getParty(_socket.player.currentPartyId);
                    if (party)
                    {
                        for (i = 0; i < party.players.length; i++)
                        {
                            var partySocket = getSocketByPlayerId(party.players[i]["id"]);
                            if (canJoinLobby(_lobbyId, partySocket) == Lobby.JOIN_SUCCESS)
                            {
                                joinLobby(_lobbyId, partySocket);
                            }
                        }
                    }
                    else
                    {
                        joinLobby(_lobbyId, _socket);
                    }
                    break;
            }
        }
    }
}

function getPlayerValue(_player)
{
    if (_player)
    {
        return _player.level * (_player.prestige + 1);
    }
    return 1;
}

function joinLobbyByGameModeId(_socket, _gameModeId, _bBattlezone)
{
    if (!_socket.player)
    {
        return;
    }
    if (_gameModeId)
    {
        log(tracePlayer(_socket), "Wants to join game mode", chalk.bgCyan(_gameModeId));
    }
    else
    {
        log(tracePlayer(_socket), "Auto join...");
    }
    if (!validateClient(_socket))
    {
        return;
    }
    var currentLobbyId = _socket.player.currentLobbyId;
    if (currentLobbyId)
    {
        if (_gameModeId)
        {
            removeSocketPlayerFromLobby(_socket, "joining_different_lobby");
        }
        return;
    }
    var currentPartyId = _socket.player.currentPartyId;
    if (currentPartyId)
    {
        var party = getParty(currentPartyId);
        if (party)
        {
            if (getSocketPlayerId(_socket) !== party.hostPlayerId)
            {
                return;
            }
        }
    }
    //Auto join
    if (!_gameModeId)
    {
        var all = getAllPublicLobbies();
        _socket.info.autoJoinAttempts++;
        if (_socket.info.autoJoinAttempts >= 60)
        {
            log(tracePlayer(_socket), "Joining random lobby...");
            shuffleArray(all);
            for (var i = 0; i < all.length; i++)
            {
                var cur = all[i];
                if (cur["gameModeId"] == GameMode.BATTLEZONE && !_bBattlezone)
                {
                    continue;
                }
                if (cur["rotationId"] == GameMode.COMBAT_TRAINING && !(_socket.player.level <= 25 && _socket.player.prestige == 0))
                {
                    continue;
                }
                if (canJoinLobby(cur["id"], _socket) == Lobby.JOIN_SUCCESS)
                {
                    _gameModeId = cur["rotationId"] ? cur["rotationId"] : cur["gameModeId"];
                    break;
                }
            }
        }
        else
        {
            all.sort(function (a, b)
            {
                var playerVal = getPlayerValue(_socket.player);
                var avgA = getAveragePlayerLevel(a.players) - playerVal;
                var avgB = getAveragePlayerLevel(b.players) - playerVal;
                if (avgA > avgB) return 1;
                if (avgA < avgB) return -1;
                if (a.players.length > b.players.length) return -1;
                if (a.players.length < b.players.length) return 1;
                return 0;
            });
            for (var i = 0; i < all.length; i++)
            {
                var cur = all[i];
                if (cur["gameModeId"] == GameMode.BATTLEZONE && !_bBattlezone)
                {
                    continue;
                }
                if (cur["rotationId"] == GameMode.COMBAT_TRAINING && !(_socket.player.level <= 25 && _socket.player.prestige == 0))
                {
                    continue;
                }
                if (cur["players"].length > 0 && canJoinLobby(cur["id"], _socket) === Lobby.JOIN_SUCCESS)
                {
                    _gameModeId = cur["rotationId"] ? cur["rotationId"] : cur["gameModeId"];
                    break;
                }
            }
        }
    }
    if (lobbies[_gameModeId])
    {
        var numPlayersToJoin = getNumPlayersInParty(_socket.player.currentPartyId);
        var desiredIndex = getAvailableLobbyIndexForGameMode(_gameModeId, numPlayersToJoin);
        if (desiredIndex == -1)
        {
            var lob = lobbies[_gameModeId];
            if (lob && lob.length < serverSettings.maxPublicLobbies)
            {
                if (isRotationGameMode(_gameModeId))
                {
                    var lobby = createRotationLobby(_gameModeId);
                }
                else
                {
                    var lobby = createPublicLobby(_gameModeId);
                }
                if (lobby)
                {
                    desiredIndex = lob.length - 1;
                    broadcastServerData();
                }
            }
        }
        if (desiredIndex >= 0)
        {
            var lobbyData = lobbies[_gameModeId][desiredIndex];
            if (lobbyData)
            {
                var lobbyId = lobbyData["id"];
                if (lobbies[_gameModeId].length > 0)
                {
                    var result = canJoinLobby(lobbyId, _socket);
                    switch (result)
                    {
                        case Lobby.JOIN_SUCCESS:
                            var party = getParty(_socket.player.currentPartyId);
                            if (party)
                            {
                                for (i = 0; i < party.players.length; i++)
                                {
                                    var partySocket = getSocketByPlayerId(party.players[i]["id"]);
                                    if (canJoinLobby(lobbyId, partySocket) == Lobby.JOIN_SUCCESS)
                                    {
                                        joinLobby(lobbyId, partySocket);
                                    }
                                }
                            }
                            else
                            {
                                joinLobby(lobbyId, _socket);
                            }
                            break;
                    }
                }
            }
        }
    }
    else
    {
        //log("No lobby to join");
    }
}

function lobbyCanAcceptPlayers(_lobbyId, _numPlayers = 1)
{
    if (!serverSettings.bAllowJoinInProgress)
    {
        return false;
    }
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        if (lobbyData["state"] == LobbyState.STARTING)
        {
            return false;
        }
        var numBots = getNumBotsInLobby(lobbyData["id"]);
        var numDummies = getNumDummiesInLobby(lobbyData.id);
        if ((lobbyData.players.length - numBots - numDummies) + _numPlayers > lobbyData["maxPlayers"])
        {
            return false;
        }
        if (lobbyData["bPrivate"])
        {
            if (lobbyData.gameData && lobbyData.gameData.settings.bPrivate)
            {
                return false;
            }
        }
        var game = lobbyData["game"];
        if (game)
        {
            return game.canAcceptNewPlayers();
        }
        else
        {
            return false;
        }
    }
    return false;
}

function canJoinLobby(_lobbyId, _socket)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {        
        if (!_socket.player)
        {
            return Lobby.JOIN_FAIL_ERROR;
        }
        if (_socket.player.bAdmin)
        {
            return Lobby.JOIN_SUCCESS;
        }
        var numBots = getNumBotsInLobby(lobbyData["id"]);
        var numDummies = getNumDummiesInLobby(lobbyData.id);
        var numInParty = getNumPlayersInParty(_socket.player.currentPartyId);
        if (((lobbyData["players"].length - numBots - numDummies) + numInParty) > lobbyData["maxPlayers"])
        {
            return Lobby.JOIN_FAIL_CAPACITY;
        }
        else if (lobbyData["bLocked"])
        {
            if (lobbyCanAcceptPlayers(_lobbyId, numInParty))
            {
                return Lobby.JOIN_SUCCESS;
            }
            else
            {
                return Lobby.JOIN_FAIL_LOCKED;
            }
        }
        else
        {
            return Lobby.JOIN_SUCCESS;
        }
    }
    return Lobby.JOIN_FAIL_ERROR;
}

function canJoinParty(_partyId, _socket)
{
    var party = getParty(_partyId);
    if (party)
    {       
        var numInParty = 1; //getNumPlayersInParty(_socket.player.currentPartyId);
        if ((party["players"].length + numInParty) > Party.MAX_PLAYERS)
        {
            return Party.JOIN_FAIL_CAPACITY;
        }
        else
        {
            var host = getSocketByPlayerId(party.hostPlayerId);
            if (host)
            {
                if (host.player.currentLobbyId)
                {
                    var result = canJoinLobby(host.player.currentLobbyId, _socket);
                    switch (result)
                    {
                        case Lobby.JOIN_SUCCESS:
                            //joinLobby(host.player.currentLobbyId, _socket);
                            break;

                        default:
                            return result;
                    }
                }
            }
            return Party.JOIN_SUCCESS;
        }
    }
    return Party.JOIN_FAIL_ERROR;
}

function checkLobbyReady(_lobbyId)
{    
    if (_lobbyId)
    {
        var lobbyData = getLobbyData(_lobbyId);
        if (lobbyData)
        {
            if (lobbyData["bPrivate"])
            {
                return;
            }            
            if (lobbyData["state"] === LobbyState.INTERMISSION && lobbyData["players"].length > 0)
            {
                return;
            }           
            log(chalk.bgCyan(_lobbyId), "Checking if lobby is ready to start...");
            if (lobbyData["state"] === LobbyState.IN_PROGRESS)
            {
                if (lobbyData["players"].length === 0)
                {
                    setLobbyState(_lobbyId, lobbyData["bPrivate"] ? LobbyState.WAITING_HOST : LobbyState.WAITING);
                    stopLobbyInterval(_lobbyId);
                }                
            }
            else if (!lobbyData["bLocked"])
            {
                tryMerge(lobbyData);
                var minTeams = lobbyData.minPlayers >= 2 ? 2 : 1; //TODO: SHOULD BE 2
                if ((getNumRealPlayersInLobby(_lobbyId) >= lobbyData.minPlayers && getNumRealTeamPlayersInLobby(_lobbyId) >= minTeams) || lobbyData.players.length == lobbyData.maxPlayers)
                {
                    var prevState = lobbyData["state"];
                    setLobbyState(_lobbyId, LobbyState.PREPARING);
                    if (!intervals[_lobbyId])
                    {
                        if (prevState != LobbyState.PREPARING || !lobbyData["timer"])
                        {
                            lobbyData["timer"] = Lobby.COUNTDOWN_PREPARING;
                        }
                        stopLobbyInterval(_lobbyId);  
                        intervals[_lobbyId] = setInterval(onLobbyTimer, 1000, _lobbyId);
                    }
                    onLobbyAboutToStart(lobbyData);
                }
                else
                {
                    setLobbyState(_lobbyId, LobbyState.WAITING);
                    stopLobbyInterval(_lobbyId);                    
                }
                io.sockets.in(_lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
            }
        }
    }
}

function tryMerge(_lobbyData)
{
    if (_lobbyData)
    {
        var sameModeLobbies = lobbies[_lobbyData["rotationId"] ? _lobbyData["rotationId"] : _lobbyData["gameModeId"]];
        if (sameModeLobbies && sameModeLobbies.length >= 2)
        {
            for (var i = 0; i < sameModeLobbies.length; i++)
            {
                var curLobby = sameModeLobbies[i];
                if (curLobby && curLobby["id"] != _lobbyData["id"])
                {
                    mergeLobbies(_lobbyData, curLobby);
                }
            }
        }
    }
}

function sendChatMessageToSocket(_socketId, _data)
{
    if (_data)
    {
        var socket = getSocketById(_socketId);
        if (socket)
        {
            socket.emit("receiveLobbyChatMessage", _data);
        }
    }
}

function votekickPlayer(_lobbyId, _playerId, _playerToKickId)
{
    log("Votekick", _playerToKickId);
    var ps = getLobbyPlayerById(_lobbyId, _playerToKickId);
    if (ps)
    {
        if (ps.bBot)
        {
            //return;
        }        
        var lobby = getLobbyData(_lobbyId);
        if (lobby)
        {
            var votekick = lobby.votekick;
            if (!votekick)
            {
                votekick = {};
            }
            if (!votekick[_playerToKickId])
            {
                votekick[_playerToKickId] = {
                    players: []
                };
            }
            var cur = votekick[_playerToKickId];
            if (cur.players.indexOf(_playerId) >= 0)
            {
                return;
            }
            cur.players.push(_playerId);
            var numVotes = cur.players.length;
            var neededVotes = Math.ceil(lobby.players.length * 0.5);
            log(numVotes, "/", neededVotes, "votes");
            sendChatMessage(lobby.id, {
                bServer: true,
                messageText: numVotes + "/" + neededVotes + " votes needed to kick " + ps.name
            });
            if (numVotes >= neededVotes)
            {
                log("Kick player");
                var socket = getSocketByPlayerId(_playerToKickId);
                if (socket)
                {
                    removeSocketPlayerFromLobby(socket, "kicked");
                }
                else
                {
                    console.warn("Invalid socket for votekick");
                }
            }
        }
    }
}

function sendChatMessage(_lobbyId, _data)
{
    if (_data)
    {
        _data["date"] = new Date().toISOString();
        if (_lobbyId)
        {
            //Lobby chat
            io.sockets.in(_lobbyId).emit("receiveLobbyChatMessage", _data);
        }
        else
        {
            //Global chat
            chatHistory.push(_data);
            if (chatHistory.length > 10)
            {
                chatHistory.splice(0, 1);
            }
            var players = getAllPlayers();
            for (var i = 0; i < players.length; i++)
            {
                var socket = getSocketByPlayerId(players[i]["id"]);
                if (socket && socket.player && !socket.player.currentLobbyId)
                {
                    socket.emit("receiveLobbyChatMessage", _data);
                }
            }
        }
    }
}

function onPlayerWaitTimer(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        if (lobbyData["state"] === LobbyState.IN_PROGRESS)
        {
            if (lobbyData["waitTimer"] > 0)
            {
                io.sockets.in(_lobbyId).emit("updateWaitTimer", { timer: lobbyData["waitTimer"] });
                lobbyData["waitTimer"]--;
            }
            else if (lobbyData["waitTimer"] === 0)
            {
                var players = lobbyData["players"];
                if (players.length > 0)
                {
                    for (var i = players.length - 1; i >= 0; i--)
                    {
                        var player = players[i];
                        if (!player)
                        {
                            console.warn("Invalid player", i, players);
                        }
                        if (player && !player["bReady"])
                        {
                            var socket = getSocketByPlayerId(player["id"]);
                            if (socket)
                            {
                                log(tracePlayer(socket), "is idle");
                                disconnectSocket(socket, { reason: "idle" });
                            }
                        }
                    }
                }
                stopLobbyInterval(_lobbyId, "waitTimer");

                console.log("Players after kicking:", players.length);
                if (players.length > 1)
                {
                    var gameData = lobbyData.gameData;
                    if (gameData)
                    {
                        gameData.players = clone(players);
                        onInitGame(_lobbyId, gameData);
                    }
                    else
                    {
                        console.warn("No gameData", lobbyData.gameData)
                    }
                }
                else
                {
                    log("Not enough players, end game!");
                    endLobbyGame(_lobbyId, false);
                }
            }
        }
        else
        {
            stopLobbyInterval(_lobbyId, "waitTimer");
        }
    }
}

function onLobbyTimer(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var timerValue = lobbyData["timer"];
        lobbyData["timer"]--;
        if (timerValue <= 0)
        {
            stopLobbyInterval(_lobbyId);
            delete lobbyData["timer"];
            onLobbyTimerComplete(_lobbyId);
        }
        io.sockets.in(_lobbyId).emit("updateLobby", {
            state: lobbyData["state"],
            timer: lobbyData["timer"]
        });
    }
}

function onLobbyTimerComplete(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {

        switch (lobbyData["state"])
        {
            case LobbyState.INTERMISSION:
                setLobbyState(_lobbyId, LobbyState.WAITING);
                checkLobbyReady(_lobbyId);
                break;

            case LobbyState.PREPARING:
                setLobbyState(_lobbyId, LobbyState.STARTING);
                lobbyData["timer"] = Lobby.COUNTDOWN_STARTING;
                stopLobbyInterval(_lobbyId);
                intervals[_lobbyId] = setInterval(onLobbyTimer, 1000, _lobbyId);
                io.sockets.in(_lobbyId).emit("updateLobby", {
                    state: lobbyData["state"],
                    timer: lobbyData["timer"],
                    players: lobbyData["players"]
                });
                break;

            case LobbyState.STARTING:
                setLobbyState(_lobbyId, LobbyState.IN_PROGRESS);
                var operationId = lobbyData.gameData["operationId"];
                if (operationId)
                {                    
                    var difficulty = lobbyData.gameData.settings.difficulty;
                    var prevPrivate = lobbyData.gameData.settings.bPrivate;
                    var prevDebug = lobbyData.gameData.settings.bDebug;
                    log("Start operation:", chalk.yellow(operationId), "difficulty:", difficulty, lobbyData.gameData.settings.bPrivate);
                    log(lobbyData);
                    var operation = lobbyData.gameData.operationData ? lobbyData.gameData.operationData : operationData[operationId];
                    if (operation)
                    {             
                        lobbyData.gameData = clone(operation.gameData);
                        //Remember previous settings since operation will overwrite game data
                        lobbyData.gameData.settings["difficulty"] = difficulty;
                        lobbyData.gameData.settings["bPrivate"] = prevPrivate;
                        lobbyData.gameData.settings["bDebug"] = prevDebug;
                        lobbyData.gameData["operation"] = clone(operation);
                        lobbyData.gameData["lobbyId"] = _lobbyId;
                        lobbyData.gameData["bMultiplayer"] = true;
                        lobbyData.gameData["bRanked"] = true;
                    }
                    else
                    {                        
                        var error = "Server error: Invalid Operation data";
                    }
                }
                if (error)
                {
                    console.warn("An error occurred while starting match", error);
                    endLobbyGame(_lobbyId, false);
                    showWindowForSockets(getLobbyPlayerIds(lobbyData), {
                        titleText: "STR_ERROR",
                        messageText: "STR_ERROR_DESC",
                        error: error,
                        bShowOkayButton: false,
                        type: "TYPE_ERROR"
                    });
                }
                else
                {
                    //lobbyData.gameData["players"] = lobbyData["players"];
                    var gamePlayers = [];
                    for (var i = 0; i < lobbyData["players"].length; i++)
                    {
                        gamePlayers.push(clone(lobbyData["players"][i]));
                    }
                    lobbyData.gameData["players"] = gamePlayers;
                    lobbyData.gameData["data"] = {
                        shared: shared,
                        sprites: sprites,
                        atlas_weapons_world: atlas_weapons_world,
                        weapons: weapons,
                        mods: mods,
                        perks: perks,
                        killstreaks: killstreaks,
                        modes: game_modes,
                        maps: allMaps,
                        graph: ngraphGraph,
                        path: ngraphPath
                    };
                    io.sockets.in(_lobbyId).emit("startGame", lobbyData.gameData);
                    //Start game
                    stopLobbyInterval(_lobbyId);
                    intervals[_lobbyId] = setInterval(onEnterGame, 3000, _lobbyId);
                }
                break;
        }
    }
}

/*
function onGameInstanceEvent(_data)
{
    if (_data)
    {
        if (_data["lobbyId"])
        {
            io.sockets.in(_data["lobbyId"]).emit("gameEvent", _data);
        }
        else
        {
            console.warn("onGameInstanceEvent --> Invalid lobby", _data);
        }
    }
}
*/

function onEnterGame(_lobbyId)
{
    stopLobbyInterval(_lobbyId);
    io.sockets.in(_lobbyId).emit("enterGame");
    broadcastServerData();
}

function onInitGame(_lobbyId, _gameData)
{
    log(chalk.bgCyan(_lobbyId), "Initialize game");
    stats.gamesPlayed++; 
    stats.peakGamesInProgress = Math.max(stats.peakGamesInProgress, getLobbiesInProgress().length);
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        stopLobbyInterval(lobbyData["id"]);
        stopLobbyInterval(lobbyData["id"], "waitTimer");
        delete lobbyData["waitTimer"];

        destroyLobbyGame(lobbyData);
        //delete require.cache[require.resolve("./assets/js/game")]; //Delete game instance cache
        //var game = new (require("./assets/js/game").GameInstance)();
        var game = new gameInstance.GameInstance();
        if (game.bInit)
        {
            console.warn("Game is already initialized");
            game.destroy();
        }
        else
        {
            _gameData.players = clone(lobbyData.players);
            //TODO: Check if enough players to start game
            //Send events to clients
            game.init(_gameData, (_data) =>
            {
                if (_data)
                {
                    var lobbyId = lobbyData["id"];
                    if (lobbyId)
                    {
                        var room = io.sockets.adapter.rooms[lobbyId];
                        if (room)
                        {
                            var sockets = room.sockets;
                            var keys = Object.keys(sockets);
                            for (var i = 0; i < keys.length; i++)
                            {
                                let socket = getSocketById(keys[i]);
                                if (socket && socket.player)
                                {
                                    socket.emit("gameEvent", _data);
                                    stats.emits++;
                                }
                            }
                        }
                    }
                    else
                    {
                        console.warn("onGameInstanceEvent --> Invalid lobby id", lobbyId);
                    }
                }
            }, p2);
            game.setEndCallback(onEndGame);
            lobbyData["game"] = game;
        }
    }
    else
    {
        log("Invalid lobby data!");
    }
}

function onEndGame(_lobbyId)
{
    stopLobbyTimeout(_lobbyId);
    log(chalk.bgCyan(_lobbyId), "Starting end game timer...");
    var timeout = setTimeout(onEndGameTimeout, 15000, _lobbyId, true);
    lobbyTimers[_lobbyId] = timeout;
    //Update clans
    var lobbyData = getLobbyData(_lobbyId);
    if (!lobbyData["bPrivate"] && lobbyData.gameData["bRanked"])
    {
        var clanWins = {};
        var winner = lobbyData.game.getWinner();
        for (var i = 0; i < lobbyData.players.length; i++)
        {
            var ps = lobbyData.players[i];
            if (ps.clan && !ps.bBot)
            {
                var playerData = lobbyData["game"].getPlayerStateById(ps.id);
                if (playerData)
                {
                    var score = 0;
                    if (playerData.team == winner)
                    {
                        if (!clanWins[ps.clan])
                        {
                            clanWins[ps.clan] = true;
                            score++;
                        }
                    }
                    var keys = ["score", "captures", "returns", "plants", "defuses"];
                    for (var j = 0; j < keys.length; j++)
                    {
                        let key = keys[j];
                        if (playerData[key] > 0)
                        {
                            let val = playerData[key];
                            if (key == "score")
                            {
                                val = Math.ceil(val * 0.05);
                            }
                            score += val;
                        }
                    }
                    async_updateClanScore(ps.clan, score, playerData["kills"]);
                }
            }
        }
    }
}

function stopLobbyTimeout(_lobbyId)
{    
    var timeout = lobbyTimers[_lobbyId];
    if (timeout)
    {
        log(chalk.bgCyan(_lobbyId), "Clearing lobby timer...");
        clearTimeout(timeout);
        delete lobbyTimers[_lobbyId];
    }
}

function onEndGameTimeout(_lobbyId)
{
    endLobbyGame(_lobbyId, true);
}

function endLobbyGame(_lobbyId, _bStartIntermission)
{  
    log(chalk.bgCyan(_lobbyId), "End lobby game");
    var lobbyData = getLobbyData(_lobbyId); 
    if (lobbyData)
    {       
        
        if (lobbyData["bPrivate"])
        {
            setLobbyState(_lobbyId, LobbyState.WAITING_HOST);
        }
        else
        {
            setLobbyState(_lobbyId, _bStartIntermission ? LobbyState.INTERMISSION : LobbyState.WAITING);
        }
        io.sockets.in(_lobbyId).emit("updateLobby", getSafeLobbyData(lobbyData));
        broadcastServerData();        
    }
    else
    {
        log("Lobby doesn't exist:", _lobbyId);
    }
}

function getNumPlayersOnTeam(_lobbyData, _team)
{
    var num = 0;
    if (_lobbyData)
    {
        var players = _lobbyData.players;
        for (var i = 0; i < players.length; i++)
        {
            if (players[i].team == _team)
            {
                num++;
            }
        }
    }
    return num;
}

function getTeamValue(_players, _team)
{
    var val = 0;
    for (var i = 0; i < _players.length; i++)
    {
        var player = _players[i];
        if (player.team === _team)
        {
            val += player.level + (player.prestige * 50);
        }
    }
    return val;
}

function setLobbyTeams(_lobbyData)
{
    if (!_lobbyData)
    {
        log("Invalid lobby data!");
        return;
    }
    var gameModeId = _lobbyData["gameModeId"];
    var bTeamGameMode = isTeamGameMode(gameModeId);
    var settings = _lobbyData.gameData["settings"];
    var players = _lobbyData["players"];
    if (players)
    {
        var factions = settings["factions"];
        if (!_lobbyData["bPrivate"])
        {
            //Sort players into teams for public lobbies
            if (bTeamGameMode)
            {
                if (_lobbyData.rotationId == GameMode.COMBAT_TRAINING && getNumRealPlayersInLobby(_lobbyData.id) < (_lobbyData.maxPlayers * 0.5))
                {
                    var combatTeam = MathUtil.RandomBoolean() ? 0 : 1;
                    for (var i = 0; i < players.length; i++)
                    {
                        let player = players[i];
                        if (player.bBot)
                        {
                            if (getNumPlayersOnTeam(_lobbyData, 0) > getNumPlayersOnTeam(_lobbyData, 1))
                            {
                                player.team = 1;
                            }
                            else
                            {
                                player.team = 0;
                            }
                        }
                        else
                        {
                            player.team = combatTeam;
                        }
                    }
                }
                else
                {

                    players.sort((a, b) =>
                    {
                        if (!a.currentPartyId) return 1;
                        if (!b.currentPartyId) return -1;
                        if (a.currentPartyId < b.currentPartyId) return -1;
                        if (a.currentPartyId > b.currentPartyId) return 1;
                        return 0;
                    });

                    var parties = [];
                    var partyPlayers = [];
                    var lonePlayers = [];
                    for (var i = 0; i < players.length; i++)
                    {
                        var player = players[i];
                        if (player.currentPartyId && getNumPlayersInParty(player.currentPartyId) > 1)
                        {
                            if (parties.indexOf(player.currentPartyId) == -1)
                            {
                                parties.push(player.currentPartyId);
                            }
                            player.team = parties.indexOf(player.currentPartyId) % 2 == 0 ? 0 : 1;
                            partyPlayers.push(player);
                        }
                        else 
                        {
                            lonePlayers.push(player);
                        }
                    }

                    lonePlayers.sort((a, b) =>
                    {
                        if (a.prestige < b.prestige) return 1;
                        if (a.prestige > b.prestige) return -1;
                        if (a.level < b.level) return 1;
                        if (a.level > b.level) return -1;
                        return 0;
                    });

                    for (var i = 0; i < lonePlayers.length; i++)
                    {
                        if (getNumPlayersOnTeam(_lobbyData, 0) > getNumPlayersOnTeam(_lobbyData, 1))
                        {
                            lonePlayers[i].team = 1;
                        }
                        else
                        {
                            lonePlayers[i].team = 0;
                        }
                    }

                    /*
                    for (var i = 0; i < lonePlayers.length; i++)
                    {
                        if (getNumPlayersOnTeam(_lobbyData, 0) > getNumPlayersOnTeam(_lobbyData, 1) + 1)
                        {
                            lonePlayers[i].team = 1;
                        }
                        else if (getNumPlayersOnTeam(_lobbyData, 1) > getNumPlayersOnTeam(_lobbyData, 0) + 1)
                        {
                            lonePlayers[i].team = 0;
                        }
                        else
                        {
                            lonePlayers[i].team = (getTeamValue(lonePlayers, 0) > getTeamValue(lonePlayers, 1)) ? 1 : 0;
                        }
                    }
                    */

                    players = partyPlayers.concat(lonePlayers);                    
                }

                players.sort((a, b) =>
                {
                    if (a.team < b.team) return -1;
                    if (a.team > b.team) return 1;
                    return 0;
                });
                _lobbyData["players"] = players;
            }
        }
        var bUsePreferred = false;
        var bUseDesiredTeam = _lobbyData["bPrivate"] && bTeamGameMode;
        for (var i = 0; i < players.length; i++)
        {
            var player = players[i];            
            switch (gameModeId)
            {
                case GameMode.BATTLEZONE:
                    if (getNumPlayersInParty(player.currentPartyId) > 1)
                    {
                        player["team"] = players.length + getPartyIndex(player.currentPartyId);
                    }
                    else
                    {
                        player["team"] = i;
                    }
                    bUsePreferred = true;
                    break;

                case GameMode.GUN_GAME:
                case GameMode.DEATHMATCH:
                    player["team"] = i;
                    bUsePreferred = true;
                    break;

                case GameMode.INFECTED:
                case GameMode.SURVIVAL_BASIC:
                case GameMode.SURVIVAL_UNDEAD:
                case GameMode.SURVIVAL_CHAOS:
                case GameMode.SURVIVAL_STAKEOUT:
                case GameMode.SURVIVAL_PRO:
                case GameMode.OPERATION:
                case GameMode.SANDBOX:
                    player["team"] = 0;
                    bUsePreferred = true;
                    break;

                default:
                    if (bUseDesiredTeam)
                    {
                        if (player["desiredTeam"] !== undefined)
                        {
                            player["team"] = player["desiredTeam"];
                        }
                        else
                        {
                            if (player["bBot"] && settings["botTeam"] >= 0)
                            {
                                player["team"] = settings["botTeam"];
                            }
                            else
                            {
                                player["team"] = getBestTeam(players);
                            }
                        }
                    }
                    else
                    {
                        if (player["team"] == null)
                        {
                            player["team"] = MathUtil.Random(0, 1);
                        }
                    }
                    bUsePreferred = false;
                    break;
            }
            var factionId = factions ? factions[player["team"]] : null;
            if (!factionId || bUsePreferred)
            {
                factionId = player.avatars["preferred"];
            }
            player["avatarData"] = player.avatars[factionId];
            if (bUsePreferred)
            {
                player.avatarData["preferred"] = player.avatars["preferred"];
            }
        }

        players.sort(function (a, b)
        {
            if (a.team < b.team) return -1;
            if (a.team > b.team) return 1;
            return 0;
        });
    }
}

function initPlayerForGameInProgress(_playerData, _lobbyId)
{
    var player = _playerData;
    if (player)
    {
        var lobbyData = getLobbyData(_lobbyId);
        if (lobbyData)
        {
            log("Initializing player for game...");
            var players = lobbyData["players"];
            var factions = lobbyData.gameData.settings["factions"];
            var bUsePreferred = false;
            switch (lobbyData["gameModeId"])
            {
                case GameMode.BATTLEZONE:
                    var availableTeams = [];
                    for (var i = 0; i < lobbyData["maxPlayers"]; i++)
                    {
                        availableTeams.push(i);
                    }            
                    if (player.currentPartyId && getNumPlayersInParty(player.currentPartyId) > 1)
                    {
                        player["team"] = lobbyData.maxPlayers + getPartyIndex(player.currentPartyId);
                    }
                    else
                    {
                        for (var i = 0; i < players.length; i++)
                        {
                            let curTeam = players[i]["team"];
                            if (curTeam != null)
                            {
                                availableTeams.splice(availableTeams.indexOf(curTeam), 1);
                            }
                        }
                        player["team"] = availableTeams[0];
                    }
                    bUsePreferred = true;
                    break;

                case GameMode.GUN_GAME:
                case GameMode.DEATHMATCH:
                    var availableTeams = [];
                    for (var i = 0; i < lobbyData["maxPlayers"]; i++)
                    {
                        availableTeams.push(i);
                    }
                    for (var i = 0; i < players.length; i++)
                    {
                        let curTeam = players[i]["team"];
                        if (curTeam != null)
                        {
                            availableTeams.splice(availableTeams.indexOf(curTeam), 1);
                        }
                    }
                    player["team"] = availableTeams[0];
                    bUsePreferred = true;
                    break;

                case GameMode.SURVIVAL_BASIC:
                case GameMode.SURVIVAL_UNDEAD:
                case GameMode.SURVIVAL_CHAOS:
                case GameMode.SURVIVAL_STAKEOUT:
                case GameMode.SURVIVAL_PRO:   
                case GameMode.OPERATION:
                    player["team"] = 0;
                    bUsePreferred = true;
                    break;

                case GameMode.INFECTED:
                    player["team"] = 1;
                    bUsePreferred = true;
                    break;

                default:
                    var playersPerTeam = [0, 0];
                    var partyTeam = null;
                    for (var i = 0; i < players.length - 1; i++)
                    {
                        let curPlayer = players[i];
                        if (curPlayer["team"] != undefined)
                        {
                            playersPerTeam[curPlayer["team"]]++;
                        }
                        if (player.currentPartyId && curPlayer.currentPartyId === player.currentPartyId)
                        {
                            partyTeam = curPlayer["team"];
                        }
                    }
                    if (partyTeam != null)
                    {
                        player["team"] = partyTeam;
                    }
                    else
                    {
                        if (playersPerTeam[0] > playersPerTeam[1])
                        {
                            player["team"] = 1;
                        }
                        else if (playersPerTeam[0] < playersPerTeam[1])
                        {
                            player["team"] = 0;
                        }
                        else
                        {
                            var game = lobbyData["game"];
                            if (game)
                            {
                                player["team"] = game.getNewPlayerDesiredTeam();
                            }
                            else
                            {
                                player["team"] = MathUtil.Random(0, 1);
                            }
                        }
                    }
                    break;
            }
            var factionId = factions ? factions[player["team"]] : null;
            if (!factionId || bUsePreferred)
            {
                factionId = player.avatars["preferred"];
            }
            player["avatarData"] = player.avatars ? player.avatars[factionId] : null;
            if (player["avatarData"])
            {
                if (bUsePreferred)
                {
                    player.avatarData["preferred"] = player.avatars["preferred"]
                }
            }
            else
            {
                console.warn("Invalid avatar data", player);
            }
        }
    }
}

function getBestTeam(_players)
{
    if (_players)
    {
        var arr = [
            {
                team: 0,
                num: 0
            },
            {
                team: 1,
                num: 0
            }
        ];
        for (var i = 0; i < _players.length; i++)
        {
            var player = _players[i];
            if (player["team"] !== undefined)
            {
                var obj = arr[player["team"]];
                obj.num++;
            }
        }
        arr.sort(function (a, b) { return a.num - b.num });
        return arr[0].team;
    }
    return 0;
}

function verifyPrivateLobbyTeams(_lobbyData)
{
    if (_lobbyData)
    {
        var settings = _lobbyData.gameData["settings"];
        if (settings["bDebug"])
        {
            return true;
        }
        var players = _lobbyData["players"];
        if (isTeamGameMode(_lobbyData["gameModeId"]) && settings["bots"] === 0)
        {
            var teams = [false, false];
            for (var i = 0; i < players.length; i++)
            {
                var player = players[i];
                if (player["desiredTeam"] !== undefined)
                {
                    teams[player["desiredTeam"]] = true;
                    if (teams[0] && teams[1])
                    {
                        return true;
                    }
                }
            }
            return false;
        }
        else
        {
            if (settings["botTeam"] >= 0)
            {
                var botTeam = settings["botTeam"];
                var requiredPlayerTeam = botTeam === 1 ? 0 : 1;
                for (var i = 0; i < players.length; i++)
                {
                    var player = players[i];
                    if (player["desiredTeam"] === undefined || player["desiredTeam"] === requiredPlayerTeam)
                    {
                        return true;
                    }
                }
            }
            else
            {
                return true;
            }
        }        
    }
    return false;
}

function resetPlayers(_players)
{
    if (_players)
    {
        for (var i = 0; i < _players.length; i++)
        {
            resetPlayer(_players[i]);
        }
        _players.sort(function (a, b)
        {
            if (a.bLobbyHost) return -1;
            if (b.bLobbyHost) return 1;
            if (a.bPartyHost) return -1;
            if (b.bPartyHost) return 1; 
            return 0;
        })
    }
}

function resetPlayer(_player)
{
    delete _player["team"];
    delete _player["bReady"];
    delete _player["bInGame"];
    //delete _player["desiredTeam"];
}

function destroyLobbyGame(_lobbyData)
{
    if (_lobbyData)
    {
        var game = _lobbyData["game"];
        if (game)
        {
            game.destroy();
            delete _lobbyData["game"];
        }
    }
}

function setLobbyState(_lobbyId, _state)
{
    log(chalk.bgCyan(_lobbyId), "-->", chalk.inverse(_state));
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        destroyLobbyGame(lobbyData);
        stopLobbyInterval(_lobbyId);
        stopLobbyTimeout(_lobbyId); 
        
        lobbyData["state"] = _state;
        switch (lobbyData["state"])
        {
            case LobbyState.WAITING:
                removeBotsFromLobby(_lobbyId);
                lobbyData["bLocked"] = false;
                lobbyData["timer"] = -1;
                resetPlayers(lobbyData["players"]);
                break;

            case LobbyState.WAITING_HOST:
                removeBotsFromLobby(_lobbyId);
                lobbyData["bLocked"] = false;
                lobbyData["timer"] = -1;
                resetPlayers(lobbyData["players"]);
                var gameData = lobbyData["gameData"];
                if (gameData.operation)
                {
                    log(chalk.bgCyan(_lobbyId), "Resetting operation data");
                    lobbyData["gameModeId"] = GameMode.OPERATION;
                    gameData["gameModeId"] = GameMode.OPERATION;
                    gameData["operationId"] = gameData.operation["id"];
                    var prevDebug = gameData.settings["bDebug"];
                    var prevDifficulty = gameData.settings["difficulty"];
                    var prevPrivate = gameData.settings["bPrivate"];
                    gameData["settings"] = getDefaultGameModeSettings(GameMode.OPERATION);
                    gameData.settings["bDebug"] = prevDebug;
                    gameData.settings["bPrivate"] = prevPrivate != null ? prevPrivate : true;
                    gameData.settings["difficulty"] = prevDifficulty;
                    delete gameData.operation;
                }
                break;

            case LobbyState.PREPARING:
                lobbyData["bLocked"] = false;
                break;

            case LobbyState.STARTING:
                lobbyData["bLocked"] = true;
                var lobbyMaps = lobbyData["maps"];
                if (lobbyMaps)
                {
                    var bestIndex = 0;
                    var mostVotes = 0;
                    for (var i = 0; i < lobbyMaps.length; i++)
                    {
                        var votes = lobbyMaps[i]["votes"].length;
                        if (votes > mostVotes)
                        {
                            bestIndex = i;
                            mostVotes = votes;
                        }
                    }
                    lobbyData.gameData["mapId"] = lobbyMaps[bestIndex]["id"]; 
                    if (lobbyData["rotationId"])
                    {
                        lobbyData.gameData.gameModeId = lobbyMaps[bestIndex]["gameModeId"];
                        lobbyData.gameData.settings = getDefaultGameModeSettings(lobbyData.gameData.gameModeId);
                        lobbyData.gameData.settings["bPrivate"] = lobbyData["bPrivate"];
                        if (lobbyData.bHardcore != undefined)
                        {
                            lobbyData.gameData.settings["bHardcore"] = lobbyData.bHardcore;
                        }
                        lobbyData.gameModeId = lobbyData.gameData.gameModeId;
                        log("Selected game mode:", chalk.yellow(lobbyData.gameModeId));
                    }
                }                
                if (lobbyData.gameData["mapId"] === Map.RANDOM)
                {
                    log("Getting random map...");
                    var maps = [
                        Map.RIVERSIDE,
                        Map.DISTRICT,
                        Map.WAREHOUSE,
                        Map.OUTPOST,
                        Map.ESTATE,
                        Map.FACTORY,
                        Map.DOWNTURN,
                        Map.SANDSTORM,
                        Map.OVERGROWN,
                        Map.AIRPORT
                    ];
                    if (lobbyMaps)
                    {
                        for (var i = 0; i < lobbyMaps.length; i++)
                        {
                            var curLobbyMap = lobbyMaps[i];
                            var index = maps.indexOf(curLobbyMap.id);
                            if (index >= 0)
                            {
                                maps.splice(index, 1);
                            }
                        }
                    }
                    lobbyData.gameData["mapId"] = maps[MathUtil.Random(0, maps.length - 1)];
                }
                log("Selected map:", chalk.yellow(lobbyData.gameData["mapId"]));                
                if (lobbyData["bPrivate"])
                {
                    var bDebug = lobbyData.gameData.settings["bDebug"];
                    var debugPlayers = 32; //Debugging
                    var maxBots = bDebug ? debugPlayers : (shared["maxPlayers"][lobbyData["gameModeId"]] - 1);
                    var numBots = Math.min(lobbyData.gameData.settings["bots"], maxBots); 
                    var avg = getAveragePlayerLevel(lobbyData["players"]); 
                    var maxLobbyPlayers = bDebug ? debugPlayers : Lobby.MAX_PLAYERS;
                    for (i = 0; i < numBots; i++)
                    {
                        if (lobbyData["players"].length < maxLobbyPlayers)
                        {
                            var botSkill = lobbyData.gameData.settings["botSkill"];
                            if (botSkill < 0)
                            {
                                botSkill = Math.min(Math.floor(avg / 15), GameData.BOT_SKILL_HARD);
                            }
                            var bot = BotUtil.getLobbyData(botSkill);
                            lobbyData["players"].push(bot);
                        }
                        else
                        {
                            break;
                        }
                    }
                }
                else
                {
                    if (lobbyData["bAddBots"])
                    {
                        var numNeeded = lobbyData["maxPlayers"] - lobbyData["players"].length;
                        if (numNeeded > 0)
                        {
                            for (i = 0; i < numNeeded; i++)
                            {
                                var bot = getBotPlayerForLobby(lobbyData);
                                if (bot)
                                {
                                    lobbyData["players"].push(bot);
                                }
                            }
                        }
                    }
                }    
                var factions = lobbyData.gameData.settings["factions"];
                if (factions)
                {
                    var arr = [GameData.FACTION_DELTA_FORCE, GameData.FACTION_GSG9, GameData.FACTION_GIGN, GameData.FACTION_OPFOR, GameData.FACTION_SPETSNAZ, GameData.FACTION_MILITIA];
                    var factionA = MathUtil.Random(0, arr.length - 1);
                    factions[0] = arr[factionA];
                    arr.splice(factionA, 1);
                    factions[1] = arr[MathUtil.Random(0, arr.length - 1)];
                    lobbyData.gameData.settings["factions"] = factions;
                }
                setLobbyTeams(lobbyData);
                break;

            case LobbyState.IN_PROGRESS:
                lobbyData["bLocked"] = true;
                if (getNumRealPlayersInLobby(_lobbyId).length == 0)
                {
                    log("Lobby is empty, reset state");
                    resetMapVotes(_lobbyId);
                    setLobbyState(_lobbyId, LobbyState.WAITING);
                }
                else
                {
                    lobbyData["waitTimer"] = Lobby.WAIT_TIMER;
                    stopLobbyInterval(_lobbyId, "waitTimer");
                    intervals[_lobbyId + "_waitTimer"] = setInterval(onPlayerWaitTimer, 1000, _lobbyId);
                }
                break;

            case LobbyState.INTERMISSION:
                removeBotsFromLobby(_lobbyId);
                lobbyData["bLocked"] = false;
                lobbyData["timer"] = Lobby.INTERMISSION_TIMER;
                stopLobbyInterval(_lobbyId);                
                intervals[_lobbyId] = setInterval(onLobbyTimer, 1000, _lobbyId);
                resetPlayers(lobbyData["players"]);
                lobbyData["maps"] = getRandomLobbyMaps(lobbyData["gameModeId"], lobbyData["rotationModes"]);
                tryMerge(lobbyData);
                break;
        }
    }
}

function getDummyBotPlayer(_botSkill, _name)
{                       
    var bot = BotUtil.getLobbyData(_botSkill);
    bot.bDummy = true;
    bot.id = getRandomUniqueId();
    bot.name = _name ? _name : ("Player" + MathUtil.Random(1, 999));
    if (_botSkill >= 3)
    {
        bot.prestige = MathUtil.Random(1, 10);
    }
    bot.card = titlecards_soldiers[MathUtil.Random(0, titlecards_soldiers.length - 1)];
    bot.callsign = null; //MathUtil.Random(1, 4) == 1 ? null : ("soldier_" + (bot.prestige > 0 ? MathUtil.Random(5, 6) : MathUtil.Random(1, 4)));
    bot.bPremium = true;
    bot.latency = MathUtil.Random(10, 100);
    return bot;
}

function getBotPlayerForLobby(_lobbyData)
{
    if (_lobbyData)
    {
        var botSkill = 1;
        var avg = getAveragePlayerLevel(_lobbyData["players"]);
        if (avg == 50)
        {
            botSkill = 3; //Insane
        }
        else
        {
            botSkill = Math.min(2, Math.floor(avg / 15));
        }
        if (_lobbyData.rotationId == GameMode.COMBAT_TRAINING)
        {
            botSkill = Math.min(botSkill, GameData.BOT_SKILL_HARD);
        }
        var bot = BotUtil.getLobbyData(botSkill);
        return bot;
    }
    return null;
}

function stopLobbyInterval(_lobbyId, _id)
{
    var id = _lobbyId;
    if (_id)
    {
        id += "_" + _id;
    }
    var interval = intervals[id];
    if (interval)
    {
        clearInterval(interval);
        delete intervals[_lobbyId];
    }
}

function retractLobbyMapVote(_socketId, _lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var maps = lobbyData["maps"];
        if (maps)
        {
            for (var i = 0; i < maps.length; i++)
            {
                var mapData = maps[i];
                var votes = mapData["votes"];
                if (votes)
                {
                    var voteIndex = votes.indexOf(_socketId);
                    if (voteIndex >= 0)
                    {
                        votes.splice(voteIndex, 1);
                    }
                }
            }
        }
    }
}

function resetMapVotes(_lobbyId)
{
    var lobbyData = getLobbyData(_lobbyId);
    if (lobbyData)
    {
        var maps = lobbyData["maps"];
        if (maps)
        {
            for (var i = 0; i < maps.length; i++)
            {
                maps[i]["votes"] = [];
            }
        }
        delete lobbyData.votekick;
    }
}

function getAllClanPlayers(_socket)
{
    async_getClanPlayers(_socket);
}

function getOnlinePlayersInClan(_clan)
{
    var players = getAllPlayers();
    var arr = [];
    for (var i = 0; i < players.length; i++)
    {
        var ps = players[i];
        if (ps.clan == _clan)
        {
            arr.push(ps);
        }
    }
    return arr;
}

function getClanInvitablePlayers()
{
    var sockets = getAllSockets();
    var arr = [];
    for (var i = 0; i < sockets.length; i++)
    {
        var socket = sockets[i];
        if (socket.info && socket.player)
        {
            if (socket.info.username && !socket.player.clan && !socket.player.currentLobbyId && socket.player["bAllowPartyInvites"])
            {
                arr.push(socket.player);
            }
        }
    }
    return arr;
}

function getAllPlayers()
{
    var players = [];
    Object.keys(io.sockets.connected).forEach(function (_socketId)
    {
        var player = io.sockets.connected[_socketId].player;
        if (player)
        {
            var data = clone(player);            
            var curLobby = getLobbyData(player.currentLobbyId);            
            if (curLobby)
            {
                data["gameModeId"] = curLobby.rotationId ? curLobby.rotationId : curLobby.gameModeId;
                if (curLobby.bPrivate)
                {
                    data["bPrivateLobby"] = true;
                }
                if (curLobby.state == LobbyState.IN_PROGRESS)
                {
                    data["bInGame"] = true;                    
                }
            }
            players.push(data);
        }
    });
    if (dummies)
    {
        for (var i = 0; i < dummies.length; i++)
        {
            player = dummies[i];
            data = clone(player);
            curLobby = getLobbyData(player.currentLobbyId);
            if (curLobby)
            {
                data["gameModeId"] = curLobby.rotationId ? curLobby.rotationId : curLobby.gameModeId;
                if (curLobby.bPrivate)
                {
                    data["bPrivateLobby"] = true;
                }
                if (curLobby.state == LobbyState.IN_PROGRESS)
                {
                    data["bInGame"] = true;
                }
            }
            players.push(data);
        }
    }
    players.sort((a, b) =>
    {
        if (a.prestige > b.prestige) return -1;
        if (b.prestige < b.prestige) return 1;
        if (a.level > b.level) return -1;
        if (b.level < b.level) return 1;
        return 0;
    });
    return players;
}

function getAllSockets()
{
    var sockets = [];
    Object.keys(io.sockets.connected).forEach(function (_socketId)
    {
        var socket = io.sockets.connected[_socketId];
        if (socket)
        {
            sockets.push(socket);
        }
    });
    if (dummies)
    {
        for (var i = 0; i < dummies.length; i++)
        {
            sockets.push({
                info: {
                    version: Server.GAME_VERSION,
                    host: "xwilkinx.com",
                },
                player: dummies[i]
            });
        }
    }
    sockets.sort((a, b) =>
    {
        if (a.player.prestige > b.player.prestige) return -1;
        if (a.player.prestige < b.player.prestige) return 1;
        if (a.player.level > b.player.level) return -1;
        if (a.player.level < b.player.level) return 1;
        return 0;
    })
    return sockets;
}

function getNumClients()
{
    var keys = Object.keys(io.sockets.connected);
    return keys.length + (dummies ? dummies.length : 0);
}

function getSocketById(_id)
{
    var socket = io.sockets.connected[_id];
    if (socket)
    {
        return socket;
    }
    return getSocketByPlayerId(_id);
}

function getSocketByPlayerId(_id)
{
    var keys = Object.keys(io.sockets.connected);
    for (var i = 0; i < keys.length; i++)
    {
        var key = keys[i];
        var socket = io.sockets.connected[key];
        if (key.indexOf(_id) == 2)
        {
            return socket;
        }
    }
    return null;
}

function getSocketByUsername(_id)
{
    var keys = Object.keys(io.sockets.connected);
    for (var i = 0; i < keys.length; i++)
    {
        var socket = io.sockets.connected[keys[i]];
        if (socket && socket.player && socket.info.username == _id)
        {
            return socket;
        }
    }
    return null;
}

function showClientDataFailedWindow(_socket)
{
    console.warn(tracePlayer(_socket), "Validation failed!");
    if (_socket)
    {
        _socket.emit("showWindow", {
            titleText: "STR_MENU_MULTIPLAYER",
            messageText: "STR_ERROR_CLIENT_VALIDATION_FAILED_DESC",
            bShowOkayButton: true
        });
    }
}

function showMultiplayerLoginWindow(_socket)
{
    console.log(tracePlayer(_socket), "Player is not logged in");
    if (_socket)
    {
        _socket.emit("showWindow", {
            id: "mpLogin",
            titleText: "STR_MENU_MULTIPLAYER",
            messageText: "STR_MULTIPLAYER_LOGIN",
            type: "TYPE_YES_NO",
            yesText: "STR_LOG_IN_REGISTER"
        });
    }
}

function showBannedWindow(_socket)
{
    console.warn(tracePlayer(_socket), "Player is banned!");
    if (_socket)
    {
        _socket.emit("showWindow", {
            titleText: "STR_MENU_MULTIPLAYER",
            messageText: "STR_ERROR_BANNED",
            bShowOkayButton: true
        });
    }
}

function getLobbyPlayerIds(_lobbyData)
{
    var arr = [];
    if (_lobbyData)
    {
        for (var i = 0; i < _lobbyData.players.length; i++)
        {
            arr.push(_lobbyData.players[i].id);
        }
    }
    return arr;
}

function showWindowForSockets(_ids, _windowData)
{
    if (_ids)
    {
        for (var i = 0; i < _ids.length; i++)
        {
            var socket = getSocketByPlayerId(_ids[i]);
            if (socket)
            {
                socket.emit("showWindow", _windowData);
            }
        }
    }
}

function validateClient(_socket)
{
    if (_socket)
    {
        if (verifyClientPlayerData(_socket.player))
        {
            return true;
        }
        else
        {            
            showClientDataFailedWindow(_socket);
            _socket.disconnect();
            return false;
        }
    }
    return false;
}

function verifyClientPlayerData(_data)
{
    if (_data)
    {
        try
        {
            //Check level and prestige
            if (_data.level < 0 || _data.level > GameData.MAX_LEVEL)
            {
                console.warn("Invalid level:", _data.level);
                return false;
            }
            if (_data.prestige < 0 || _data.prestige > GameData.MAX_PRESTIGE)
            {
                console.warn("Invalid prestige:", _data.prestige);
                return false;
            }

            //Check custom classes
            var classes = _data.classes;
            if (classes)
            {
                for (var i = 0; i < classes.length; i++)
                {
                    var curClass = classes[i];
                    if (curClass)
                    {
                        if (!isValidWeaponId(curClass.primary.id))
                        {
                            console.warn("Invalid primary id:", curClass.primary.id);
                            return false;
                        }
                        if (!isValidWeaponId(curClass.secondary.id))
                        {
                            console.warn("Invalid secondary id:", curClass.secondary.id);
                            return false;
                        }
                        if (!isValidWeaponId(curClass.equipment))
                        {
                            console.warn("Invalid equipment id:", curClass.equipment);
                            return false;
                        }
                        if (curClass.primary.id == "minigun" || curClass.secondary.id == "minigun")
                        {
                            console.warn("Using minigun");
                            return false;
                        }
                        if (curClass.primary.id == "railgun" || curClass.secondary.id == "railgun")
                        {
                            console.warn("Using railgun");
                            return false;
                        }
                    }
                    else
                    {
                        console.warn("Invalid class data");
                        return false;
                    }
                }
            }
            else
            {
                console.warn("Invalid classes");
                return false;
            }

            //Check killstreaks
            var killstreaks = _data.killstreaks;
            if (killstreaks)
            {
                if (killstreaks["TYPE_ASSAULT"].length > 3)
                {
                    console.warn("Invalid assault killstreaks:", killstreaks["TYPE_ASSAULT"].length);
                    return false;
                }
                if (killstreaks["TYPE_SUPPORT"].length > 3)
                {
                    console.warn("Invalid support killstreaks:", killstreaks["TYPE_SUPPORT"].length);
                    return false;
                }
                if (killstreaks["TYPE_SPECIALIST"].length > 5)
                {
                    console.warn("Invalid perk killstreaks:", killstreaks["TYPE_SPECIALIST"].length);
                    return false;
                }
            }
            else
            {
                return false;
            }

            //Check avatar data
            var avatars = _data.avatars;
            if (avatars)
            {
                var factions = [
                    GameData.FACTION_DELTA_FORCE,
                    GameData.FACTION_OPFOR,
                    GameData.FACTION_GSG9,
                    GameData.FACTION_SPETSNAZ,
                    GameData.FACTION_GIGN,
                    GameData.FACTION_MILITIA
                ];
                for (var i = 0; i < factions.length; i++)
                {
                    var curFaction = factions[i];
                    var curAvatar = avatars[curFaction];
                    if (curAvatar)
                    {
                        /*
                        if (curAvatar.body.indexOf(curFaction) === -1)
                        {
                            log("Invalid avatar data (body does not contain faction id)");
                            return false;
                        }
                        */
                    }
                    else
                    {
                        console.warn("Invalid avatar data");
                        return false;
                    }
                }
            }
            else
            {
                console.warn("Invalid avatars");
                return false;
            }
            //Validation passed
            return true;
        }
        catch (e)
        {
            console.warn("An error occured while verifying client player data");
            console.error(e);            
            return false;
        }
    }
    return false;
}

function isValidWeaponId(_id)
{
    if (weapons)
    {
        for (var i = 0; i < weapons.length; i++)
        {
            let wpn = weapons[i];
            if (wpn.id === _id)
            {
                if (wpn.bHidden)
                {
                    return false;
                }
                return true;
            }
        }
    }
    return false;
}

function getLatestServerData()
{
    var numLobbies = 0;
    var keys = Object.keys(lobbies);
    for (var i = 0; i < keys.length; i++)
    {
        numLobbies += lobbies[keys[i]].length;
    }
    var playerList = getAllPlayers();
    var serverData = {
        version: Server.VERSION,
        players: playerList.length,
        maxPlayers: serverSettings.maxClients,        
        gamesInProgress: getLobbiesInProgress().length,
        lobbies: numLobbies
    };
    return serverData;
}

function getPartyIndex(_partyId)
{
    var keys = Object.keys(parties);
    for (var i = 0; i < keys.length; i++)
    {
        if (parties[keys[i]].id == _partyId)
        {
            return i;
        }
    }
    return null;
}

function getAllLobbies()
{
    var arr = [];
    var ids = Object.keys(lobbies);
    for (var i = 0; i < ids.length; i++)
    {
        var curId = ids[i];
        for (var j = 0; j < lobbies[curId].length; j++)
        {
            arr.push(lobbies[curId][j]);
        }
    }
    return arr;
}

function getLobbyList(_socket)
{
    var arr = [];
    var ids = Object.keys(lobbies);
    for (var i = 0; i < ids.length; i++)
    {
        var curId = ids[i];
        //if (curId !== "private")
        for (var j = 0; j < lobbies[curId].length; j++)
        {
            let cur = lobbies[curId][j];
            if (curId == "private" && cur.gameData.settings["bPrivate"])
            {
                continue;
            }
            let data = {
                id: cur.id,
                bPrivate: curId == "private",
                numPlayers: getNumRealPlayersInLobby(cur.id),
                maxPlayers: cur.maxPlayers,                    
                gameModeId: cur.gameModeId,
                rotationId: cur.rotationId,
                state: cur.state,
                bCanJoin: _socket ? (canJoinLobby(cur.id, _socket) == Lobby.JOIN_SUCCESS) : false
            };
            if (cur.state == LobbyState.IN_PROGRESS)
            {
                data["mapId"] = cur.gameData ? cur.gameData.mapId : null;
            }
            arr.push(data);
        }
    }
    return arr;
}

function getAllPublicLobbies()
{
    var arr = [];
    var ids = Object.keys(lobbies);
    for (var i = 0; i < ids.length; i++)
    {
        var curId = ids[i];
        if (curId !== "private")
        {
            for (var j = 0; j < lobbies[curId].length; j++)
            {
                let lobby = lobbies[curId][j];
                arr.push(lobby);
            }
        }
    }
    return arr;
}

function getLobbiesInProgress()
{
    var arr = [];
    var lobbies = getAllLobbies();
    for (var i = 0; i < lobbies.length; i++)
    {
        var lobby = lobbies[i];
        if (lobby["state"] === LobbyState.IN_PROGRESS)
        {
            arr.push(lobby);
        }
    }
    return arr;
}

function getRandomUniqueId()
{
    return Math.random().toString(36).substr(2, 4);
}

function isRotationGameMode(_id)
{
    switch (_id)
    {
        case GameMode.ROTATION_TEAM:
        case GameMode.ROTATION_SURVIVAL:
        case GameMode.ROTATION_COMMUNITY:
        case GameMode.GROUND_WAR:
            return true;
    }
    return false;
}

function isTeamGameMode(_id)
{
    if (game_modes)
    {
        for (var i = 0; i < game_modes.length; i++)
        {
            var mode = game_modes[i];
            if (mode["id"] === _id)
            {
                return mode["bTeam"];
            }
        }
    }
    return false;
}

function shuffleArray(array)
{
    var currentIndex = array.length, temporaryValue, randomIndex;
    while (0 !== currentIndex)
    {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

function clone(_data)
{
    return JSON.parse(JSON.stringify(_data));
}

function convertMS(milliseconds)
{
    var day, hour, minute, seconds;
    seconds = Math.floor(milliseconds / 1000);
    minute = Math.floor(seconds / 60);
    seconds = seconds % 60;
    hour = Math.floor(minute / 60);
    minute = minute % 60;
    day = Math.floor(hour / 24);
    hour = hour % 24;
    return {
        day: day,
        hour: hour,
        minute: minute,
        seconds: seconds
    };
}

function throttleSocket(_socket, _data)
{
    if (_socket)
    {
        rateLimiter.consume(_socket.id).
            then(() =>
            {
                return true;
            }).
            catch(r =>
            {
                //console.warn(tracePlayer(_socket), "Exceeded throttle limit!");
                disconnectSocket(_socket, { reason: "throttle" });
                return false;
            });
    }
    return false;
}

function disconnectSocket(_socket, _data)
{
    if (_socket)
    {
        _socket.emit("disconnectInfo", _data);
        _socket.disconnect();
    }
}

//BotUtil
var BotUtil = {
    getLobbyData: function (_botSkill)
    {
        var level = 1;
        var prestige = 0;
        var botSkill = _botSkill;
        switch (_botSkill)
        {            
            case 1:
                level = MathUtil.Random(10, 30);
                break;
            case 2:
                level = MathUtil.Random(30, 49);
                break;
            case 3:
                level = GameData.MAX_LEVEL;
                break;
            case 4:
                level = GameData.MAX_LEVEL;
                prestige = GameData.MAX_PRESTIGE;
                break;            
            case 0:
            default:
                level = MathUtil.Random(1, 10);
                break;
        }
        var names = botnames[botSkill];
        var factions = [
            GameData.FACTION_DELTA_FORCE,
            GameData.FACTION_GSG9,
            GameData.FACTION_GIGN,
            GameData.FACTION_OPFOR,
            GameData.FACTION_SPETSNAZ,
            GameData.FACTION_MILITIA
        ];
        var player = {
            id: getRandomUniqueId(),
            name: "BOT " + names[MathUtil.Random(0, names.length - 1)],
            bBot: true,
            botSkill: botSkill,
            level: level,
            prestige: prestige,
            card: "wilkin",
            callsign: "soldier_1",
            avatars: {
                usmc: BotUtil.getAvatarData(GameData.FACTION_DELTA_FORCE),
                gsg9: BotUtil.getAvatarData(GameData.FACTION_GSG9),
                gign: BotUtil.getAvatarData(GameData.FACTION_GIGN),
                opfor: BotUtil.getAvatarData(GameData.FACTION_OPFOR),
                rus: BotUtil.getAvatarData(GameData.FACTION_SPETSNAZ),
                militia: BotUtil.getAvatarData(GameData.FACTION_MILITIA),
                preferred: factions[MathUtil.Random(0, factions.length - 1)]
            }
        };
        return player;
    },
    getAvatarData: function (_faction)
    {
        var hairColours = [
            Character.HAIR_COLOUR_BROWN,
            Character.HAIR_COLOUR_BROWN_LIGHT,
            Character.HAIR_COLOUR_BLACK,
            Character.HAIR_COLOUR_BLONDE,
            Character.HAIR_COLOUR_GINGER
        ];
        var hairs = [
            Character.HAIR_SHORT,
            Character.HAIR_LONG,
            Character.HAIR_BUZZED,
            Character.HAIR_BALD
        ];
        var heads = [Character.HEAD_NONE];
        switch (_faction)
        {
            case GameData.FACTION_DELTA_FORCE:
                heads = [Character.HEAD_NONE, Character.HEAD_USMC_HELMET, Character.HEAD_USMC_HELMET_TACTICAL, Character.HEAD_USMC_CAP, Character.HEAD_USMC_BOONIE, Character.HEAD_DELTA_MEDIC_HELMET];
                break;
            case GameData.FACTION_GSG9:
                heads = [Character.HEAD_NONE, Character.HEAD_GSG9_HELMET, Character.HEAD_GSG9_HELMET_2, Character.HEAD_GSG9_HELMET_3, Character.HEAD_GSG9_MEDIC_HELMET];
                break;
            case GameData.FACTION_GIGN:
                heads = [Character.HEAD_NONE, Character.HEAD_GIGN_HELMET, Character.HEAD_GIGN_HELMET_2, Character.HEAD_GIGN_CAP, Character.HEAD_GIGN_MEDIC_HELMET];
                break;
            case GameData.FACTION_OPFOR:
                heads = [Character.HEAD_NONE, Character.HEAD_OPFOR_SCARF, Character.HEAD_OPFOR_HELMET_2, Character.HEAD_OPFOR_HELMET, Character.HEAD_MEDIC_HELMET];
                break;
            case GameData.FACTION_SPETSNAZ:
                heads = [Character.HEAD_NONE, Character.HEAD_RUS_HELMET, Character.HEAD_RUS_TOQUE, Character.HEAD_RUS_SCARF, Character.HEAD_MEDIC_HELMET];
                break;
            case GameData.FACTION_MILITIA:
                heads = [Character.HEAD_NONE, Character.HEAD_MILITIA_BANDANA, Character.HEAD_MILITIA_RADIO, Character.HEAD_MILITIA_BAND, Character.HEAD_MEDIC_HELMET];
                break;
        }
        var facewears = [Character.FACEWEAR_NONE, Character.FACEWEAR_MASK, Character.FACEWEAR_BALACLAVA, Character.FACEWEAR_GAITER];
        var eyewears = [Character.EYEWEAR_NONE];
        switch (_faction)
        {
            case GameData.FACTION_OPFOR:
            case GameData.FACTION_SPETSNAZ:
                var vox = Character.VOICE_RU;
                break;
            case GameData.FACTION_GIGN:
            case GameData.FACTION_MILITIA:
                vox = Character.VOICE_UK;
                break;
            case GameData.FACTION_DELTA_FORCE:
            case GameData.FACTION_GSG9:
                vox = MathUtil.RandomBoolean() ? Character.VOICE_A : Character.VOICE_B;
                break;
        }
        var avatar = {};
        avatar[Character.TYPE_HAIR_COLOUR] = hairColours[MathUtil.Random(0, hairColours.length - 1)];
        avatar[Character.TYPE_HAIR] = hairs[MathUtil.Random(0, hairs.length - 1)];
        avatar[Character.TYPE_BEARD] = Character.BEARD_NONE;
        avatar[Character.TYPE_HEAD] = heads[MathUtil.Random(0, heads.length - 1)];
        avatar[Character.TYPE_FACEWEAR] = facewears[MathUtil.Random(0, facewears.length - 1)];
        avatar[Character.TYPE_EYEWEAR] = eyewears[MathUtil.Random(0, eyewears.length - 1)];        
        var body = _faction;
        var bodies = ["", "_recon", "_para", "_rocketier", "_heavy", "_kevlar"];
        avatar[Character.TYPE_BODY] = body + bodies[MathUtil.Random(0, bodies.length - 1)];
        avatar[Character.TYPE_VOICE] = vox;
        return avatar;
    }
};

function getSocketPlayerId(_socket)
{
    if (!_socket)
    {
        return null;
    }
    if (_socket.player)
    {
        return _socket.player.id;
    }
    return _socket.id;
}

function onUpdatePlayerClan(_socket)
{
    if (_socket)
    {
        var lobbyData = getLobbyData(_socket.player.currentLobbyId);
        if (lobbyData)
        {
            var lobbyId = lobbyData["id"];
            var game = lobbyData.game;
            if (game)
            {
                game.requestEvent({
                    eventId: GameServer.EVENT_PLAYER_UPDATE,
                    playerId: getSocketPlayerId(_socket),
                    data: {
                        clan: _socket.player.clan ? _socket.player.clan : null
                    }
                });
            }
            else
            {
                var lobbyPlayer = getLobbyPlayerById(lobbyId, getSocketPlayerId(_socket));
                if (lobbyPlayer)
                {
                    lobbyPlayer.clan = _socket.player.clan;
                    io.sockets.in(lobbyId).emit("updateLobby", {
                        players: lobbyData.players
                    });
                }
            }
        }
        var partyId = _socket.player.currentPartyId;
        if (partyId)
        {
            var partyPlayer = getPartyPlayerById(partyId, getSocketPlayerId(_socket));
            if (partyPlayer)
            {
                partyPlayer.clan = _socket.player.clan;
            }
            updatePartyClients(partyId);
        }
        _socket.emit("onUpdatePlayerData", _socket.player);
        broadcastServerData();
        if (_socket.player.clan)
        {
            broadcastClanUpdate(_socket.player.clan);
        }
    }
}

function broadcastClanUpdate(_clan)
{
    var players = getOnlinePlayersInClan(_clan);
    for (var i = 0; i < players.length; i++)
    {
        var socket = getSocketByPlayerId(players[i]["id"]);
        if (socket)
        {
            socket.emit("onClanUpdated");
        }
    }
}

async function async_updateClanScore(_clan, _score, _kills)
{
    if (!uri)
    {
        return null;
    }
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        let res = await collection.findOne({
            name: { $eq: _clan }
        });
        if (res)
        {
            let resUpdate = await collection.updateOne(
                {
                    name: { $eq: _clan }
                },
                {
                    $inc: {
                        score: _score,
                        kills: _kills,
                        lastUpdated: Date.now()
                    }
                }
            );
            if (resUpdate)
            {
                log("Updated clan", _clan, _score, _kills);
                broadcastClanUpdate(_clan);
            }
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_leaveClanByUsername(_socket, _username)
{
    if (!uri)
    {
        return null;
    }
    var username = _username;
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        let res = await collection.findOne({
            players: username
        });
        if (res)
        {
            if (res.leader == username)
            {
                log("Remove clan");
                await collection.deleteOne({
                    players: username
                });
                broadcastClanUpdate(res.name);
            }
            else
            {
                log("Remove from clan");
                await collection.updateOne(
                    {
                        players: username
                    },
                    {
                        $pull: {
                            players: username
                        }
                    }
                );
            }
            onUpdatePlayerClan(_socket);
            async_getClanForSocket(_socket);
            broadcastClanUpdate(res.name);
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_leaveClanBySocket(_socket)
{
    if (!uri)
    {
        return null;
    }
    var username = _socket.info.username;
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        let res = await collection.findOne({
            players: username
        });
        if (res)
        {
            if (res.leader == username)
            {
                log("Remove clan");
                await collection.deleteOne({
                    players: username
                });
                broadcastClanUpdate(res.name);
            }
            else
            {
                log("Remove from clan");
                await collection.updateOne(
                    {
                        players: username
                    },
                    {
                        $pull: {
                            players: username
                        }
                    }
                );
            }
            _socket.player.bClanLeader = false;
            _socket.player.clan = null;
            onUpdatePlayerClan(clanSocket);
            async_getClanForSocket(_socket);
            broadcastClanUpdate(res.name);
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_getClanPlayers(_socket)
{
    if (!uri)
    {
        return null;
    }
    var clanName = _socket.player.clan;
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        var rank = 0;
        var bMatch = false;
        let res = await collection.find().sort({ score: -1, kills: -1 }).forEach((_item) =>
        {
            rank++;
            if (_item.name == clanName)
            {
                bMatch = true;
                var clanPlayers = [];
                for (var i = 0; i < _item.players.length; i++)
                {
                    var s = getSocketByUsername(_item.players[i]);
                    if (s)
                    {
                        clanPlayers.push(s.player);
                    }
                    else
                    {
                        clanPlayers.push({
                            bOffline: true,
                            id: _item.players[i],
                            name: _item.players[i]
                        });
                    }
                }
                _socket.emit("receivePlayerList", {
                    id: "players_clan",
                    clan: _socket.player.clan,
                    players: clanPlayers
                });
                return;
            }
        });
        if (!bMatch)
        {
            _socket.emit("onReceiveClanData", null);
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_getClanData(_socket)
{
    if (!uri)
    {
        return null;
    }
    var clanName = _socket.player.clan;
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        var rank = 0;
        var bMatch = false;
        let res = await collection.find().sort({ score: -1, kills: -1 }).forEach((_item) =>
        {
            rank++;
            if (_item.name == clanName)
            {
                bMatch = true;
                _socket.emit("onReceiveClanData", {
                    name: _item.name,
                    rank: rank,
                    score: _item.score,
                    kills: _item.kills,
                    numPlayers: _item.players.length,
                    leader: _item.leader
                });
                return;
            }
        });
        if (!bMatch)
        {
            _socket.emit("onReceiveClanData", null);
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_getClanList(_socket)
{
    if (!uri)
    {
        return null;
    }
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        var clans = [];
        let res = await collection.find().sort({ score: -1, kills: -1 }).forEach((_item) =>
        {
            clans.push({
                name: _item.name,
                rank: clans.length + 1,
                numPlayers: _item.players.length,
                score: _item.score,
                kills: _item.kills
            });
        });
        if (_socket)
        {
            _socket.emit("receiveClanList", clans)
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_getClanForSocket(_socket)
{
    if (!uri || !_socket.player || !_socket.info)
    {
        return;
    }
    var username = _socket.info.username;
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        var rank = 0;
        var bMatch = false;
        let res = await collection.find().sort({ score: -1, kills: -1 }).forEach((_item) =>
        {
            rank++;
            if (_item.players.indexOf(username) >= 0)
            {
                bMatch = true;
                if (_socket.player)
                {
                    _socket.player.bClanLeader = _item.leader == username;
                    _socket.player.clan = _item.name;
                    onUpdatePlayerClan(_socket);
                    _socket.emit("onReceiveClanData", {
                        name: _item.name,
                        rank: rank,
                        score: _item.score,
                        kills: _item.kills,
                        numPlayers: _item.players.length,
                        leader: _item.leader
                    });
                }
                return;
            }
        });
        if (!bMatch)
        {
            _socket.player.bClanLeader = false;
            _socket.player.clan = null;
            onUpdatePlayerClan(_socket);
            _socket.emit("onReceiveClanData", null);
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_joinClan(_socket, _clanName)
{
    if (!uri)
    {
        return null;
    }
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");

        let firstCheck = await collection.findOne({
            players: _socket.info.username
        });
        if (!firstCheck)
        {
            let res = await collection.updateOne(
                {
                    name: _clanName
                },
                {
                    $push: {
                        players: _socket.info.username
                    }
                }
            );
            if (res)
            {
                _socket.player.clan = _clanName;
                onUpdatePlayerClan(_socket);
                _socket.emit("onJoinClan", {
                    bSuccess: true
                });
            }
            else
            {
                _socket.emit("onJoinClan", {
                    bSuccess: false
                });
            }
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

async function async_createClan(_socket, _clanName)
{    
    if (!uri)
    {
        return null;
    }
    const client = await MongoClient.connect(uri).catch(e => { log(e) });
    if (!client)
    {
        return;
    }
    try 
    {
        const db = client.db("deadswitch3");
        let collection = db.collection("clans");
        let query = {
            name: _clanName
        };
        let res = await collection.findOne(query);
        if (res)
        {
            _socket.emit("onCreateClan", {
                bSuccess: false,
                message: "Clan name is already in use."
            });
        }
        else 
        {
            if (_clanName.length < 2 || badwords.includes(_clanName.toLowerCase()))
            {
                _socket.emit("onCreateClan", {
                    bSuccess: false,
                    message: "Invalid clan name."
                });
                return;
            }
            //New clan data
            let query = {
                name: _clanName,
                score: 0,
                kills: 0,
                leader: _socket.info.username,
                players: [
                    _socket.info.username
                ],
                date: Date.now(),
                lastUpdated: Date.now()
            };
            let res = await collection.insertOne(query);
            if (res)
            {
                _socket.emit("onCreateClan", {
                    bSuccess: true
                });
                _socket.player.bClanLeader = true;
                _socket.player.clan = _clanName;
                onUpdatePlayerClan(_socket);
            }
            else 
            {
                _socket.emit("onCreateClan", {
                    bSuccess: false,
                    message: "Error"
                });
            }
        }
    }
    catch (e)
    {
        log(e);
    }
    finally
    {
        client.close();
    }
    return null;
}

function addDummyToLobby(_bot, _lobbyData)
{
    if (_lobbyData)
    {
        _lobbyData.players.push(_bot);
        _bot.currentLobbyId = _lobbyData.id;
        checkLobbyReady(_lobbyData.id);
    }
}

function createDummyPlayer(_name)
{
    let bot = getDummyBotPlayer(MathUtil.Random(0, 3), _name);
    let lobbies = getAllPublicLobbies();
    var lobbiesToJoin = [1, 1, 2, 2, 3, 4];
    if (MathUtil.Random(1, 4) == 1)
    {
        for (var i = 0; i < 10; i++)
        {
            let lobby = lobbies[lobbiesToJoin[MathUtil.Random(0, lobbiesToJoin.length - 1)]];
            if (lobby && lobby.players.length < lobby.maxPlayers)
            {
                addDummyToLobby(bot, lobby);
                break;
            }
        }
    }
    dummies.push(bot);
    return bot;
}

function removeDummyPlayer()
{
    if (dummies)
    {
        var bot = dummies[0];
        if (bot)
        {
            dummies.splice(0, 1);
        }
    }
}

//Add dummy bots
var dummies = [];
if (serverSettings.numBots > 0)
{
    log(chalk.yellow("\nAdding", serverSettings.numBots, "bots..."));
    shuffleArray(bots);
    for (var i = 0; i < serverSettings.numBots; i++)
    {
        createDummyPlayer(bots[i]);
    }
    log(chalk.green("Done"));
}

//Auto restart app
if (serverSettings.maxUptimeHours > 0)
{
    log(chalk.yellow("\nMax Uptime Enabled"));
    log("Server will stop after", serverSettings.maxUptimeHours, "hours")
    var iterations = 0;
    var iterationTime = 3600000;
    setInterval(function ()
    {
        iterations++;
        if (getLobbiesInProgress().length == 0 || getNumClients() == 0 || iterations >= serverSettings.maxUptimeHours)
        {
            log("Max uptime reached");
            process.exit(0);
        }
    }, iterationTime);
}