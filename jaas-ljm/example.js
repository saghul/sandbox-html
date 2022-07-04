let options;
let roomName;
let token;

function buildOptions(tenant, roomName) {
    return {
        // Connection
        hosts: {
            domain: '8x8.vc',
            muc: `conference.${tenant}.8x8.vc`,
            focus: 'focus.8x8.vc'
        },
        serviceUrl: `wss://8x8.vc/xmpp-websocket?room=${roomName}`,
        websocketKeepAliveUrl: `https://8x8.vc/_unlock?room=${roomName}`,

        // Video quality / constraints
        constraints: {
            video: {
                height: {
                    ideal: 720,
                    max: 720,
                    min: 180
                },
                width: {
                    ideal: 1280,
                    max: 1280,
                    min: 320
                }
            }
        },
        channelLastN: 25,

        // Enable Peer-to-Peer for 1-1 calls
        p2p: {
            enabled: true
        },

        // Enable Callstats (note, none of this is secret, despite its name)
        callStatsID: '706724306',
        callStatsSecret: 'f+TKWryzPOyX:dNR8PMw42WJwM3YM1XkJUjPOLY0M40wz+0D4mZud8mQ=',
        confID: `https://8x8.vc/${tenant}/${roomName}`,
        siteID: tenant,
        applicationName: 'My Sample JaaS App',

        // Misc
        deploymentInfo: {},

        // Logging
        logging: {
            // Default log level
            defaultLogLevel: 'trace',

            // The following are too verbose in their logging with the default level
            'modules/RTC/TraceablePeerConnection.js': 'info',
            'modules/statistics/CallStats.js': 'info',
            'modules/xmpp/strophe.util.js': 'log'
        },

        // End marker, disregard
        __end: true
    };
}

let connection = null;
let room = null;

let localTracks = [];
const remoteTracks = {};
let participantIds = new Set();

function onLocalTracks(tracks) {
    localTracks = tracks;
    for (let i = 0; i < localTracks.length; i++) {
        if (localTracks[i].getType() === 'video') {
            $('body').append(`<video autoplay='1' id='localVideo${i}' />`);
            localTracks[i].attach($(`#localVideo${i}`)[0]);
        } else {
            $('body').append(
                `<audio autoplay='1' muted='true' id='localAudio${i}' />`);
            localTracks[i].attach($(`#localAudio${i}`)[0]);
        }
    }
}


function onRemoteTrack(track) {
    const participant = track.getParticipantId();

    if (!remoteTracks[participant]) {
        remoteTracks[participant] = [];
    }
    const idx = remoteTracks[participant].push(track);
    const id = participant + track.getType() + idx;

    if (track.getType() === 'video') {
        $('body').append(
            `<video autoplay='1' id='${participant}video${idx}' />`);
    } else {
        $('body').append(
            `<audio autoplay='1' id='${participant}audio${idx}' />`);
    }
    track.attach($(`#${id}`)[0]);
}


function onConferenceJoined() {
    console.log('conference joined!');
}


function onUserJoined(id) {
    console.log('user joined');

    participantIds.add(id);

    // Select all participants so we can receive video
    room.selectParticipants(Array.from(participantIds));
}


function onUserLeft(id) {
    console.log('user left');

    participantIds.delete(id);
    
    room.selectParticipants(Array.from(participantIds));
}


function onConnectionSuccess() {
    room = connection.initJitsiConference(roomName, options);

    // Add local tracks before joining
    for (let i = 0; i < localTracks.length; i++) {
        room.addTrack(localTracks[i]);
    }

    // Setup event listeners
    room.on(
        JitsiMeetJS.events.conference.TRACK_ADDED,
        track => {
            !track.isLocal() && onRemoteTrack(track);
        });
    room.on(
        JitsiMeetJS.events.conference.CONFERENCE_JOINED,
        onConferenceJoined);
    room.on(
        JitsiMeetJS.events.conference.USER_JOINED,
        onUserJoined);
    room.on(
        JitsiMeetJS.events.conference.USER_LEFT,
        onUserLeft);

    // Join
    room.join();
    room.setSenderVideoConstraint(720);  // Send at most 720p
    room.setReceiverVideoConstraint(360);  // Receive at most 360p for each participant
}


function onConnectionFailed() {
    console.error('Connection Failed!');
}


function disconnect() {
    console.log('disconnect!');
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnectionSuccess);
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onConnectionFailed);
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        disconnect);
}


// Close all resources when closing the page.
function disconnect() {
    for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].dispose();
    }
    if (room) {
        room.leave();
    }
    if (connection) {
        connection.disconnect();
    }
}

$(window).bind('beforeunload', disconnect);
$(window).bind('unload', disconnect);

$(document).ready(function() {
    $("#goButton").click(async function() {
        const tenant = $("#tenantInput").val();
        token = $("#tokenInput").val();
        roomName = $("#roomInput").val();

        options = buildOptions(tenant, roomName);

        // Initialize lib-jitsi-meet
        JitsiMeetJS.init(options);

        // Initialize logging.
        JitsiMeetJS.setLogLevel(options.logging.defaultLogLevel);
        for (const [ loggerId, level ] of Object.entries(options.logging)) {
            if (loggerId !== 'defaultLogLevel') {
                JitsiMeetJS.setLogLevelById(level, loggerId);
            }
        }

        const tracks = await JitsiMeetJS.createLocalTracks({ devices: [ 'audio', 'video' ] });
        onLocalTracks(tracks);

        connection = new JitsiMeetJS.JitsiConnection(null, token, options);

        connection.addEventListener(
            JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
            onConnectionSuccess);
        connection.addEventListener(
            JitsiMeetJS.events.connection.CONNECTION_FAILED,
            onConnectionFailed);
        connection.addEventListener(
            JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
            disconnect);

        connection.connect();
    });
});
