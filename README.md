# Deadswitch 3 Multiplayer Server

## Overview
This repository allows you to host your own Deadswitch 3 multiplayer server.

## Requirements
You will need NPM and NodeJS installed on the machine you wish to host the server on. 

## Hosting on Local PC
If you wish to host the server on your local PC, installing NPM and NodeJS is free and quick to do. Note that this will only allow players on your LAN to connect, port-forward the server.

You will need to add a local proxy for LAN players to connect, since they will not be able to connect to a `localhost` URL. You can use https://github.com/icflorescu/iisexpress-proxy for this.

## Hosting on External Server
You can use a free/cheap NodeJS service to host the multiplayer server which will allow any player to join. Heroku is recommended.

## Instructions
Navigate to the directory in which you wish to install the Deadswitch 3 multiplayer server.

Clone the repository:
`git clone https://github.com/XWILKINX/ds3mp-custom`

Install the required dependencies:
`npm install`

Start the server:
`npm start`

## Connecting to the Server
First, enable the `Use Custom Server` in-game. 

Enter the custom server URL you are using (the default is `localhost:8081`). 

## Additional Details
You can test and view the current server stats by visiting the server URL in your browser.

`Ranked > Multiplayer` will now connect to this custom server URL. Simply disable `Use Custom Server` to revert back to the public server list.
