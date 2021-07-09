# Deadswitch 3 Multiplayer Server

![Deadswitch 3](https://xwilkinx.com/play/ds3/latest/assets/images/ui/logo_deadswitch3.png)

## Overview
This repository allows you to host your own Deadswitch 3 multiplayer server.

Hosting your own Deadswitch 3 multiplayer server is easy to do. The entire process only takes about 5 minutes.

It's recommended to have a basic understanding of command line use and git.

Decide on where you want to install and run the server. You can host it on your local machine for LAN play or on an external cloud service like Heroku, Google Cloud, AWS, etc. These services typically provide free tiers that don't have any costs.

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

To verify you have Node.js v14 installed: `node -v`

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

## Additional Details

Note that access to clans and the leaderboards is not available when using a custom multiplayer server for security reasons.

## Server Updates

Server updates are frequently released. You'll need to stop and restart the server in order for changes to take effect.

To update the server code to the latest:
`git pull`

Then start the server again:
`npm start`
