# Deadswitch 3 Multiplayer Server

© 2022 Wilkin Games

## Branches
Please create a new branch if you wish to make any changes. Do not commit to main!

## Overview
This repository allows you to host your own Deadswitch 3 multiplayer server.

Hosting your own Deadswitch 3 multiplayer server is easy to do. The entire process only takes about 5 minutes.

It's recommended to have a basic understanding of command line use and git.

Decide on where you want to install and run the server. You can host it on your local machine for LAN play or on an external cloud service like Heroku, Google Cloud, AWS, etc. These services typically provide free tiers that don't have any costs.

Note that access to clans is not available when using a custom multiplayer server for security reasons.

## Requirements
You will need Node.js installed on the machine you wish to host the server on. Node.js is free and easy to install.

Note: It's recommended to have access to at least 1 CPU and 2GB of RAM on the machine the server is running on. These requirements scale as the number of concurrent games in progress grows.

### Node.js: Ubuntu Installation

`sudo apt update`

`curl -sL https://deb.nodesource.com/setup_14.x -o nodesource_setup.sh`

`sudo bash nodesource_setup.sh`

`sudo apt install nodejs`

### Node.js: Windows/Other Installation

Visit the Node.js website for installation instructions: https://nodejs.org/en/download/

### Verify Node.js Version

To verify you have Node.js v14 installed: 

`node -v`

## Hosting

You can either host on your local PC or an external service.

### Hosting on Local PC
If you wish to host the server on your local PC, make sure you have Node.js installed. 

Note that this will only allow players on your LAN to connect, unless you have some sort of port-forwarding set up.

You will need to add a local proxy for LAN players to connect, since they will not be able to connect to a `localhost` URL. You can use https://github.com/icflorescu/iisexpress-proxy for this.

### Hosting on External Server
You can use a free/cheap Node.js app service to host the multiplayer server which will allow any player to join. Heroku is recommended.

## Instructions
Navigate to the directory in which you wish to install the Deadswitch 3 multiplayer server.

Clone this repository:

`git clone https://github.com/XWILKINX/ds3mp-custom`

Install the required dependencies:

`npm install`

Start the Deadswitch 3 multiplayer server:

`npm start`

If the server was successfully started, you should see the following output at the end:

`Listening on IPv6 :::8081`

Congratulations! The multiplayer server is now running and ready for players to connect.

## Connecting to the Server

Once the server is running, players can now connect. The server runs on port `8081` by default.

First, enable the `Use Custom Server` setting in-game. 

Enter the `Custom Server URL` the server is running on.

**For local machines:** If you are hosting the server on your local PC, use the default (`localhost:8081`).

**For external services:** Enter your external server IP address. Remember to include the port `8081` if necessary (for example `192.1.1.1:8081`).

`Ranked > Multiplayer` will now connect to the custom server URL you have specified. Simply turn off the `Use Custom Server` setting to revert back to using the public server list.

## Server Management

### Updates

Server updates are frequently released. You'll need to stop and restart the server in order for changes to take effect.

To update the server code to the latest:

`git pull`

`npm install`

Then start the server again:

`npm start`

### Configuration

You can configure server settings in the `settings.json` file.

#### Port

Specify the desired port by setting the `port` value. The default is `8081`.

#### Ban Players

Specified players to ban by either Deadswitch 3 username or Steam ID with `bannedUsernames` and `bannedSteamIds`.

#### Welcome Message

You can set a public server message by setting `welcomeMessage`.

### PM2

It's useful to automatically restart the server in the event it stops for any reason, especially if you have `maxUptimeHours` set. Using PM2 handles this, ensuring the server remains active until manually stopped. This is particularly useful if you are hosting on an external service.

Install PM2:

`sudo npm install pm2 -g`

Start the server with PM2:

`pm2 start server.js`

You can view server logs using PM2:

`pm2 logs`
