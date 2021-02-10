let options;
let roomName;
let token;

function buildOptions(tenant) {
    return {
        connection: {
            hosts: {
                domain: '8x8.vc',
                muc: `conference.${tenant}.8x8.vc`,
                focus: 'focus.8x8.vc'
            },
            serviceUrl: `wss://8x8.vc/xmpp-websocket?room=${roomName}`,
            clientNode: 'http://jitsi.org/jitsimeet'
        },
        conference: {
            p2p: {
                enabled: true
            }
        }
    };
}

let connection = null;
let isJoined = false;
let room = null;

let localTracks = [];
const remoteTracks = {};


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
        if (isJoined) {
            room.addTrack(localTracks[i]);
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
    isJoined = true;
    for (let i = 0; i < localTracks.length; i++) {
        room.addTrack(localTracks[i]);
    }
}


function onUserLeft(id) {
    console.log('user left');
    if (!remoteTracks[id]) {
        return;
    }
    const tracks = remoteTracks[id];

    for (let i = 0; i < tracks.length; i++) {
        tracks[i].detach($(`#${id}${tracks[i].getType()}`));
    }
}


function onConnectionSuccess() {
    room = connection.initJitsiConference(roomName, options.conference);
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
        id => {
            console.log(`user joined: id`);
        });
    room.on(
        JitsiMeetJS.events.conference.USER_LEFT,
        onUserLeft);
    room.join();
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
    JitsiMeetJS.init();

    $("#goButton").click(function() {
        const tenant = $("#tenantInput").val();
        options = buildOptions(tenant);
        token = $("#tokenInput").val();
        roomName = $("#roomInput").val();

        connection = new JitsiMeetJS.JitsiConnection(null, token, options.connection);

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

        JitsiMeetJS.createLocalTracks({ devices: [ 'audio', 'video' ] })
            .then(onLocalTracks)
            .catch(error => {
                throw error;
            });
    });
});
