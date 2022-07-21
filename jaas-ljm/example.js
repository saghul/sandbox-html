const LJM_SCRIPT = 'ljmScript';
const BASE_SOURCE = 'https://8x8.vc/libs/lib-jitsi-meet.min.js';
const BASE_SOURCE_STAGE = 'https://stage.8x8.vc/libs/lib-jitsi-meet.min.js';
const REGION_SHARD_MAPPING = {
    'default': 'default',
    'frankfurt': 'eu-central-1',
    'london': 'eu-west-2'
};
const INVALID_CLASS = 'is-invalid';
const HIDE_CLASS = 'd-none';

let options;
let roomName;
let token;
let releaseVersion;
let useStage;

function buildOptions(tenant, room, release) {
    const selectedRegion = document.getElementById('regionInput').value;
    const hasRegion = selectedRegion !== 'default';
    const region = hasRegion ? `${selectedRegion}.` : '';
    const stage = useStage ? 'stage.' : ''
    const subdomain = useStage ? stage : region;
    const releaseVersion = release ? `?release=release-${release}` : '';

    return {

        // Connection
        hosts: {
            domain: `${stage}8x8.vc`,
            muc: `conference.${tenant}.${stage}8x8.vc`,
            focus: `focus.${stage}8x8.vc`
        },
        serviceUrl: `wss://${subdomain}8x8.vc/${tenant}/xmpp-websocket?room=${room}${releaseVersion}`,
        websocketKeepAliveUrl: `https://${subdomain}8x8.vc/${tenant}/_unlock?room=${room}`,

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
        confID: `https://${stage}8x8.vc/${tenant}/${room}`,
        siteID: tenant,
        applicationName: 'My Sample JaaS App',

        // Misc
        deploymentInfo: hasRegion ? { userRegion: REGION_SHARD_MAPPING[selectedRegion] } : {},

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

const cleanupDOM = id => {
    const element = document.getElementById(id);
    element && element.remove();
};

const onLocalTracks = tracks => {
    localTracks = tracks;
    for (let i = 0; i < localTracks.length; i++) {
        if (localTracks[i].getType() === 'video') {
            const videoId = `localVideo${i}`;
            cleanupDOM(videoId);

            let videoNode = document.createElement('video');
            videoNode.id = videoId;
            videoNode.className = 'col-12 pb-2';
            videoNode.autoplay = '1';
            document.body.appendChild(videoNode);
            const localVideo = document.getElementById(videoId);
            localTracks[i].attach(localVideo);
        } else {
            const audioId = `localAudio${i}`;
            cleanupDOM(audioId);

            let audioNode = document.createElement('audio');
            audioNode.id = audioId;
            audioNode.autoplay = '1';
            document.body.appendChild(audioNode);
            const localAudio = document.getElementById(audioId)
            localTracks[i].attach(localAudio);
        }
    }
};

const onRemoteTrack = track => {
    const participant = track.getParticipantId();

    if (!remoteTracks[participant]) {
        remoteTracks[participant] = [];
    }
    const idx = remoteTracks[participant].push(track);
    const id = participant + track.getType() + idx;

    if (track.getType() === 'video') {
        const videoId = `${participant}video${idx}`;
        cleanupDOM(videoId);

        let videoNode = document.createElement('video');
        videoNode.id = videoId;
        videoNode.className = 'col-6 d-inline-block py-2';
        videoNode.autoplay = '1';
        document.body.appendChild(videoNode);
    } else {
        const audioId = `${participant}audio${idx}`;
        cleanupDOM(audioId);

        let audioNode = document.createElement('audio');
        audioNode.id = audioId;
        audioNode.autoplay = '1';
        document.body.appendChild(audioNode);
    }
    const remoteTrack = document.getElementById(id);
    track.attach(remoteTrack);
};


const onConferenceJoined = () => {
    console.log('conference joined!');
};

const onConferenceLeft = () => {
    console.log('conference left!');
};

const onUserJoined = id => {
    console.log('user joined!');

    participantIds.add(id);

    // Select all participants so we can receive video
    room.selectParticipants(Array.from(participantIds));
};


const onUserLeft = id => {
    console.log('user left!');

    participantIds.delete(id);

    room.selectParticipants(Array.from(participantIds));
};


const onConnectionSuccess = () => {
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
        JitsiMeetJS.events.conference.CONFERENCE_LEFT,
        onConferenceLeft);
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
};


const onConnectionFailed = () => {
    console.error('connection failed!');
};

const isTenantValid = () => {
    if (!tenantInput.value.startsWith('vpaas-magic-cookie-')) {
        tenantInput.classList.add(INVALID_CLASS);
        return false;
    }

    if (tenantInput.classList.contains(INVALID_CLASS)) {
        tenantInput.classList.remove(INVALID_CLASS);
    }

    return true;
};

const isRoomValid = () => {
    if (!roomInput.value) {
        roomInput.classList.add(INVALID_CLASS);
        return false;
    }

    if (roomInput.classList.contains(INVALID_CLASS)) {
        roomInput.classList.remove(INVALID_CLASS);
    }

    return true;
};

const isConfigValid = () => {
    const validTenant = isTenantValid();
    const validRoom = isRoomValid();

    return validTenant && validRoom;
};

const connect = async () => {
    if (!isConfigValid()) {
        console.log('invalid configuration!');
        return;
    }

    const tenant = document.getElementById('tenantInput').value;
    token = document.getElementById('tokenInput').value;
    roomName = document.getElementById('roomInput').value;

    options = buildOptions(tenant, roomName, releaseVersion);

    // Initialize lib-jitsi-meet
    JitsiMeetJS.init(options);

    // Initialize logging.
    JitsiMeetJS.setLogLevel(options.logging.defaultLogLevel);
    for (const [loggerId, level] of Object.entries(options.logging)) {
        if (loggerId !== 'defaultLogLevel') {
            JitsiMeetJS.setLogLevelById(level, loggerId);
        }
    }

    const tracks = await JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] });
    onLocalTracks(tracks);

    connection = new JitsiMeetJS.JitsiConnection(null, token, options);
    console.log(`using LJM version ${JitsiMeetJS.version}!`);

    connection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnectionSuccess);
    connection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onConnectionFailed);
    connection.addEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        disconnect);

    return connection.connect();
};

// [testing purposes] Cleanup DOM of remote tracks.
const removeRemoteTracks = () => {
    const remoteVideo = document.getElementsByTagName('video');
    const remoteAudio = document.getElementsByTagName('audio');

    for (let i = remoteVideo.length - 1; i >= 0; i--) {
        remoteVideo[i].remove();
    }
    for (let i = remoteAudio.length - 1; i >= 0; i--) {
        remoteAudio[i].remove();
    }
};


// Close all resources when closing the page.
const disconnect = async () => {
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

    for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].dispose();
    }

    return await connection.disconnect();
};

// Restart the connection.
const reload = async () => {

    // [testing purposes] Disconnect all participants to apply the latest release.
    removeRemoteTracks();

    await disconnect();
    await connect();
};

// Leave the room and proceed to cleanup.
const hangup = async () => {
    removeRemoteTracks();

    if (room) {
        await room.leave();
    }

    await disconnect();
};

const addRegionsOptions = () => {
    const regionInput = document.getElementById('regionInput');
    Object.keys(REGION_SHARD_MAPPING).forEach(region => {
        const optionElem = document.createElement('option');
        optionElem.value = region;
        const upper = `${region[0].toUpperCase()}${region.substring(1)}`;
        optionElem.text = upper;
        regionInput.appendChild(optionElem);
    });
};

// [testing purposes] Notify that a connection reload is necessary to apply a different ljm script.
const signalReload = () => {
    const RELOAD_BUTTON = 'reloadButton';
    if (document.getElementById(RELOAD_BUTTON) || !document.getElementsByTagName('video').length) {
        return;
    }

    let reloadButton = document.createElement('button');
    reloadButton.id = RELOAD_BUTTON;
    reloadButton.className = 'btn btn-outline-secondary bi bi-arrow-clockwise';
    goButton.parentElement.appendChild(reloadButton);

    reloadButton.addEventListener('click', async () => {
        reload();
        reloadButton.remove();
    });
};

const updateLjmScript = (releaseVersionValue, shouldUseStage) => {
    console.log(`removing LJM version ${JitsiMeetJS.version}!`);

    const currentVersionScript = document.getElementById(LJM_SCRIPT);
    const releaseVersionParam = releaseVersionValue ? `?release=release-${releaseVersionValue}` : '';
    const baseSource = shouldUseStage ? BASE_SOURCE_STAGE : BASE_SOURCE;
    let nextVersionScript = document.createElement('script');
    nextVersionScript.id = LJM_SCRIPT;
    nextVersionScript.src = `${baseSource}${releaseVersionParam}`

    currentVersionScript.remove();
    document.body.appendChild(nextVersionScript);

    signalReload();
};

const handleReleaseUpdate = async event => {
    if ((!releaseVersion && !event.target.value) || releaseVersion === event.target.value) {
        return;
    }

    releaseVersion = event.target.value;
    updateLjmScript(releaseVersion, useStage);
};

const handleUseStageUpdate = async event => {
    useStage = event.target.checked;

    const regionInputParent = document.getElementById('regionInput').parentElement;
    if (useStage) {
        regionInputParent.classList.add(HIDE_CLASS);
    } else {
        regionInputParent.classList.contains(HIDE_CLASS) && regionInputParent.classList.remove(HIDE_CLASS);
    }

    updateLjmScript(releaseVersion, useStage);
};

window.addEventListener('beforeunload', disconnect);
window.addEventListener('unload', disconnect);

document.addEventListener('DOMContentLoaded', () => {
    addRegionsOptions();
    const form = document.getElementById('form');
    const tenantInput = document.getElementById('tenantInput');
    const roomInput = document.getElementById('roomInput');
    const releaseInput = document.getElementById('releaseInput');
    const useStageInput = document.getElementById('useStageInput');
    const goButton = document.getElementById('goButton');
    const hangupButton = document.getElementById('hangupButton');

    form.addEventListener('submit', event => event.preventDefault());
    tenantInput.addEventListener('blur', isTenantValid);
    roomInput.addEventListener('blur', isRoomValid);
    releaseInput.addEventListener('blur', handleReleaseUpdate);
    useStageInput.addEventListener('change', handleUseStageUpdate);
    goButton.addEventListener('click', connect);
    hangupButton.addEventListener('click', hangup);
});
