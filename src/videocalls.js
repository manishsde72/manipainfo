// Make sure to install the necessary dependencies
const { CallClient, VideoStreamRenderer, LocalVideoStream } = require('@azure/communication-calling');
const { AzureCommunicationTokenCredential } = require('@azure/communication-common');

const { AzureLogger, setLogLevel } = require("@azure/logger");
// Set the log level and output
// verbose, info, warning, error
setLogLevel('error');
AzureLogger.log = (...args) => {
    console.log(...args);
};

// Calling web sdk objects
let callAgent;
let deviceManager;
let call;
let incomingCall;
let localVideoStream;
let localVideoStreamRenderer;
let localCameras;
let localMicrophones;
let localSpeakers;
let selectedCameraIndex = 0;
// json ACS user object return by /api/users/{email}
let ACSUser="eyJhbGciOiJSUzI1NiIsImtpZCI6IjYwNUVCMzFEMzBBMjBEQkRBNTMxODU2MkM4QTM2RDFCMzIyMkE2MTkiLCJ4NXQiOiJZRjZ6SFRDaURiMmxNWVZpeUtOdEd6SWlwaGsiLCJ0eXAiOiJKV1QifQ.eyJza3lwZWlkIjoiYWNzOjYxODFlNTJiLTdhYWMtNGY5Zi04MzUwLWE1ZDNjOTQ0MGU1ZF8wMDAwMDAxZS00YmI5LWEwZjItMjhjNS01OTNhMGQwMGMwYTEiLCJzY3AiOjE3OTIsImNzaSI6IjE3MDc5ODUwNzUiLCJleHAiOjE3MDgwNzE0NzUsInJnbiI6ImNhIiwiYWNzU2NvcGUiOiJjaGF0LHZvaXAiLCJyZXNvdXJjZUlkIjoiNjE4MWU1MmItN2FhYy00ZjlmLTgzNTAtYTVkM2M5NDQwZTVkIiwicmVzb3VyY2VMb2NhdGlvbiI6ImNhbmFkYSIsImlhdCI6MTcwNzk4NTA3NX0.ET6dpl312EqqTAPAwh8p4RiNnQ5LvhhgWpMpUlQbVHWjj_24OemfFGvFpTmSZCACLptjcfi_-w4yC3AQAM5WQid2fx8k6jvMeHGo8ch_Kizska2bY8Hu26K1Rhjq9mGYsxvSKZh3dB6RFcUxQG_U0pBdw6PZ7zgsyAdpcPaXu4VeyTpDH1uI4zCQdKV9a8Y1xqLH60rHbEOUg1cH1HwbEk7DkzCyDznKeGcJLbc4qPv7zsViMfQ1mt6bDhVVFeKVAQkNxggsTr0XOv0oNQyzZCtZaexDVWgKmVIZCPzx9u2OTTdtI-GCUSULSbu-Q0Srlvw5273-ybv5rruwI0Ch7A";
let authUserEmail = "";

// UI widgets
let calleeAcsUserId = document.getElementById('callee-acs-user-id');
let callEchoBot = document.getElementById('callEchoBot');
let startCallButton = document.getElementById('start-call-button');
let hangUpCallButton = document.getElementById('hangup-call-button');
let acceptCallButton = document.getElementById('accept-call-button');
let startVideoButton = document.getElementById('start-video-button');
let stopVideoButton = document.getElementById('stop-video-button');
let remoteVideoContainer = document.getElementById('remoteVideoContainer');
let localVideoContainer = document.getElementById('localVideoContainer');
let twitterLoginButton = document.getElementsByClassName('twitterButton')[0];
let aadLoginButton = document.getElementsByClassName('aadButton')[0];
let googleLoginButton = document.getElementsByClassName('googleButton')[0];
let githubLoginButton = document.getElementsByClassName('githubButton')[0];
let logoutButton = document.getElementsByClassName('logoutButton')[0];
let callStateElement = document.getElementById('call-state');
let camerasSelector = document.getElementById('camerasSelector');
let microsSelector = document.getElementById('microsSelector');
let speakersSelector = document.getElementById('speakersSelector');

// Simple function to check if the user has logged in or not yet
async function getUserInfo() {
    try {
        const response = await fetch('/.auth/me');
        const payload = await response.json();
        const { clientPrincipal } = payload;
        return clientPrincipal;
    } catch (error) {
        console.error('No profile could be found');
        return undefined;
    }
}

// API call to convert an email ID to an ACS ID
async function getUserAcsId(userEmail) {
    try {
        // Calling the API to just try to resolve an email with an existing ACS User ID created
        const response = await fetch('/api/users/' + userEmail + '/true');
        const payload = await response.json();
        const { userId } = payload;
        return userId;
    } catch (error) {
        console.error('No Acs User Id has been found for this email.');
        return undefined;
    }
}

(async function() {
    function registerLoginRouter(button, provider) {
        button.addEventListener("click", () => { 
          window.location.href="/.auth/login/" + provider + "?post_login_redirect_uri=/";
        });
    }

    registerLoginRouter(twitterLoginButton, "twitter");
    registerLoginRouter(aadLoginButton, "aad");
    registerLoginRouter(githubLoginButton, "github");
    registerLoginRouter(googleLoginButton, "google");

    logoutButton.addEventListener("click", () => {
        window.location.href="/.auth/logout";
    });

    callEchoBot.addEventListener('click', (event) => {
        calleeAcsUserId.disabled = callEchoBot.checked;       
     });  

    var authenticatedUser = await getUserInfo();
    
    // We can  call the API to get an ACS User ID only if we've been authenticated
    if (authenticatedUser) {
        // If MS provider, we'll get the email address to be used as the key for the DB
        if (authenticatedUser.identityProvider == "aad" || authenticatedUser.identityProvider == "google") {
            authUserEmail=authenticatedUser.userDetails;
        }
        // Otherwise, let's build keys as "davrous@twitter" or "davrous@github"
        else {
            authUserEmail=authenticatedUser.userDetails + "@" + authenticatedUser.identityProvider;
        }
        var ACSUserQuery = await fetch(`/api/users/`+ authUserEmail);
        try {
            ACSUser = await ACSUserQuery.json();
        }
        catch {
            alert('Error while trying to call Azure Function API, please check your local.settings.json file contains valid ACS & CosmosDB connection strings.')
        }
        console.log("ACS User Token: " + ACSUser);
        console.log("Valid until: " + ACSUser.expiresOn);
        document.querySelector('#acs_user_id').textContent = ACSUser.userId;
        document.querySelector('#user_email').textContent = authUserEmail;
        document.querySelector('#loginZone').style.display = "none";
        document.querySelector('#logoutZone').style.display = "block";
        document.querySelector('#acsZone').style.display = "block";
        try {
            await initializeCallAgent();
            document.querySelector('#initialize-call-agent').style.display = "none";
            document.querySelector('#acsVideoZone').style.display = "initial";
            callStateElement.innerText = '-';
        }
        catch (error) {
            document.querySelector('#initialize-call-agent').textContent = "Error while initializing agent, please check if the token is valid.";
        }

    }
    else {
        document.querySelector('#user_email').textContent = "Please authenticate";
        document.querySelector('#loginZone').style.display = "initial";
        document.querySelector('#logoutZone').style.display = "none";
    }
}())

function fillSelector(devices, selector) {
    devices.forEach((device, index) => {
        selector.add(createOptionElement(device.name, index));
    });
}

function createOptionElement(text, value) {
    var option = document.createElement("option");
    option.text = text;
    option.value = value;
    return option;
}


async function fillDevicesSelectors() {
    try {
        localCameras = await deviceManager.getCameras();
        if (localCameras) {
            fillSelector(localCameras, camerasSelector);
            camerasSelector.addEventListener("change", (event) => {
                selectedCameraIndex = event.target.value;
            });
        }
    }
    catch (error) {
        console.warn("This device doesn't support cameras enumeration.");
    }

    try {
        localMicrophones = await deviceManager.getMicrophones();    
        if (localMicrophones) {
            fillSelector(localMicrophones, microsSelector, deviceManager.selectMicrophone);
            microsSelector.addEventListener("change", async (event) => {
                await deviceManager.selectMicrophone(localMicrophones[event.target.value]);
            });
        }
    }
    catch (error) {
        console.warn("This device doesn't support microphones enumeration.");
    }
    
    try {
        localSpeakers = await deviceManager.getSpeakers();
        if (localSpeakers) {
            fillSelector(localSpeakers, speakersSelector, deviceManager.selectSpeaker);
            speakersSelector.addEventListener("change", async (event) => {
                await deviceManager.selectSpeaker(localSpeakers[event.target.value]);
            });
        }
    }
    catch (error) {
        console.warn("This device doesn't support speakers enumeration.");
    }
}

/**
 * Using the CallClient, initialize a CallAgent instance with a CommunicationUserCredential which will enable us to make outgoing calls and receive incoming calls. 
 * You can then use the CallClient.getDeviceManager() API instance to get the DeviceManager.
 */
async function initializeCallAgent() {
    try {
        const callClient = new CallClient(); 
        tokenCredential = new AzureCommunicationTokenCredential(ACSUser);

        callAgent = await callClient.createCallAgent(tokenCredential, {displayName: 'ACS:' + authUserEmail})
        // Set up a camera device to use.
        deviceManager = await callClient.getDeviceManager();
        await deviceManager.askDevicePermission({ video: true });
        await deviceManager.askDevicePermission({ audio: true });
        await fillDevicesSelectors();

        // Listen for an incoming call to accept.
        callAgent.on('incomingCall', async (args) => {
            try {
                incomingCall = args.incomingCall;
                acceptCallButton.disabled = false;
                startCallButton.disabled = true;
            } catch (error) {
                console.error(error);
            }
        });

        startCallButton.disabled = false;
    } catch(error) {
        throw TypeError("Initializing Call agent failed.");
    }
}

/**
 * Place a 1:1 outgoing video call to a user
 * Add an event listener to initiate a call when the `startCallButton` is clicked:
 * First you have to enumerate local cameras using the deviceManager `getCameraList` API.
 * In this quickstart we're using the first camera in the collection. Once the desired camera is selected, a
 * LocalVideoStream instance will be constructed and passed within `videoOptions` as an item within the
 * localVideoStream array to the call method. Once your call connects it will automatically start sending a video stream to the other participant. 
 */
startCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
        let meetingLink = calleeAcsUserId.value.trim();
        // Easy way to do a first check that your ACS setup works ok
        // Let's call the echo bot
        if (callEchoBot.checked) {
            call = callAgent.startCall([{ id: '8:echo123' }], { videoOptions });  
        }
        else {
            if (meetingLink.includes("teams.microsoft.com")) {
                // join with meeting link
                call = callAgent.join({meetingLink: meetingLink}, { videoOptions });
            }
            else {
                // Converting email address to internal ACS User Id
                let AcsUserId = await getUserAcsId(meetingLink);
                if (AcsUserId) {
                    call = callAgent.startCall([{ communicationUserId: AcsUserId }], { videoOptions });  
                }
                else {
                    console.warn("No ACS User Id found.");
                }
            }
        }
        // Subscribe to the call's properties and events.
        if (call) {
            subscribeToCall(call);
        }
    } catch (error) {
        console.error(error);
    }
}

/**
 * Accepting an incoming call with video
 * Add an event listener to accept a call when the `acceptCallButton` is clicked:
 * After subscrigin to the `CallAgent.on('incomingCall')` event, you can accept the incoming call.
 * You can pass the local video stream which you want to use to accept the call with.
 */
acceptCallButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        const videoOptions = localVideoStream ? { localVideoStreams: [localVideoStream] } : undefined;
        call = await incomingCall.accept({ videoOptions });
        // Subscribe to the call's properties and events.
        subscribeToCall(call);
    } catch (error) {
        console.error(error);
    }
}

// Subscribe to a call obj.
// Listen for property changes and collection udpates.
subscribeToCall = (call) => {
    try {
        // Inspect the initial call.id value.
        console.log(`Call Id: ${call.id}`);
        //Subsribe to call's 'idChanged' event for value changes.
        call.on('idChanged', () => {
            console.log(`Call Id changed: ${call.id}`); 
        });

        // Inspect the initial call.state value.
        console.log(`Call state: ${call.state}`);
        // Subscribe to call's 'stateChanged' event for value changes.
        call.on('stateChanged', async () => {
            console.log(`Call state changed: ${call.state}`);
            callStateElement.innerText = call.state;
            if(call.state === 'Connected' || call.state === 'InLobby') {
                acceptCallButton.disabled = true;
                startCallButton.disabled = true;
                hangUpCallButton.disabled = false;
                startVideoButton.disabled = false;
                stopVideoButton.disabled = false;
            } else if (call.state === 'Disconnected') {
                startCallButton.disabled = false;
                hangUpCallButton.disabled = true;
                startVideoButton.disabled = true;
                stopVideoButton.disabled = true;
                console.log(`Call ended, call end reason={code=${call.callEndReason.code}, subCode=${call.callEndReason.subCode}}`);
            }   
        });

        call.localVideoStreams.forEach(async (lvs) => {
            localVideoStream = lvs;
            await displayLocalVideoStream();
        });
        call.on('localVideoStreamsUpdated', e => {
            e.added.forEach(async (lvs) => {
                localVideoStream = lvs;
                await displayLocalVideoStream();
            });
            e.removed.forEach(lvs => {
               removeLocalVideoStream();
            });
        });
        
        // Inspect the call's current remote participants and subscribe to them.
        call.remoteParticipants.forEach(remoteParticipant => {
            subscribeToRemoteParticipant(remoteParticipant);
        });
        // Subscribe to the call's 'remoteParticipantsUpdated' event to be
        // notified when new participants are added to the call or removed from the call.
        call.on('remoteParticipantsUpdated', e => {
            // Subscribe to new remote participants that are added to the call.
            e.added.forEach(remoteParticipant => {
                subscribeToRemoteParticipant(remoteParticipant)
            });
            // Unsubscribe from participants that are removed from the call
            e.removed.forEach(remoteParticipant => {
                console.log('Remote participant removed from the call.');
            });
        });
    } catch (error) {
        console.error(error);
    }
}

// Subscribe to a remote participant obj.
// Listen for property changes and collection udpates.
subscribeToRemoteParticipant = (remoteParticipant) => {
    try {
        // Inspect the initial remoteParticipant.state value.
        console.log(`Remote participant state: ${remoteParticipant.state}`);
        // Subscribe to remoteParticipant's 'stateChanged' event for value changes.
        remoteParticipant.on('stateChanged', () => {
            console.log(`Remote participant state changed: ${remoteParticipant.state}`);
        });

        // Inspect the remoteParticipants's current videoStreams and subscribe to them.
        remoteParticipant.videoStreams.forEach(remoteVideoStream => {
            subscribeToRemoteVideoStream(remoteVideoStream)
        });
        // Subscribe to the remoteParticipant's 'videoStreamsUpdated' event to be
        // notified when the remoteParticiapant adds new videoStreams and removes video streams.
        remoteParticipant.on('videoStreamsUpdated', e => {
            // Subscribe to new remote participant's video streams that were added.
            e.added.forEach(remoteVideoStream => {
                subscribeToRemoteVideoStream(remoteVideoStream)
            });
            // Unsubscribe from remote participant's video streams that were removed.
            e.removed.forEach(remoteVideoStream => {
                console.log('Remote participant video stream was removed.');
            })
        });
    } catch (error) {
        console.error(error);
    }
}

/**
 * Subscribe to a remote participant's remote video stream obj.
 * You have to subscribe to the 'isAvailableChanged' event to render the remoteVideoStream. If the 'isAvailable' property
 * changes to 'true', a remote participant is sending a stream. Whenever availability of a remote stream changes
 * you can choose to destroy the whole 'Renderer', a specific 'RendererView' or keep them, but this will result in displaying blank video frame.
 */
subscribeToRemoteVideoStream = async (remoteVideoStream) => {
    // Create a video stream renderer for the remote video stream.
    let videoStreamRenderer = new VideoStreamRenderer(remoteVideoStream);
    let view;
    const renderVideo = async () => {
        try {
            // Create a renderer view for the remote video stream.
            view = await videoStreamRenderer.createView();
            // Attach the renderer view to the UI.
            remoteVideoContainer.style.display = "flex";
            remoteVideoContainer.appendChild(view.target);
        } catch (e) {
            console.warn(`Failed to createView, reason=${e.message}, code=${e.code}`);
        }	
    }
    
    remoteVideoStream.on('isAvailableChanged', async () => {
        // Participant has switched video on.
        if (remoteVideoStream.isAvailable) {
            await renderVideo();

        // Participant has switched video off.
        } else {
            if (view) {
                view.dispose();
                view = undefined;
            }
        }
    });

    // Participant has video on initially.
    if (remoteVideoStream.isAvailable) {
        await renderVideo();
    }
}

// Start your local video stream.
// This will send your local video stream to remote participants so they can view it.
startVideoButton.onclick = async () => {
    try {
        const localVideoStream = await createLocalVideoStream();
        await call.startVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}

// Stop your local video stream.
// This will stop your local video stream from being sent to remote participants.
stopVideoButton.onclick = async () => {
    try {
        await call.stopVideo(localVideoStream);
    } catch (error) {
        console.error(error);
    }
}

/**
 * To render a LocalVideoStream, you need to create a new instance of VideoStreamRenderer, and then
 * create a new VideoStreamRendererView instance using the asynchronous createView() method.
 * You may then attach view.target to any UI element. 
 */
// Create a local video stream for your camera device
createLocalVideoStream = async () => {
    const camera = (await deviceManager.getCameras())[selectedCameraIndex];
    if (camera) {
        return new LocalVideoStream(camera);
    } else {
        console.error(`No camera device found on the system`);
    }
}
// Display your local video stream preview in your UI
displayLocalVideoStream = async () => {
    try {
        localVideoStreamRenderer = new VideoStreamRenderer(localVideoStream);
        const view = await localVideoStreamRenderer.createView();
        localVideoContainer.style.display = "flex";
        localVideoContainer.appendChild(view.target);
    } catch (error) {
        console.error(error);
    } 
}
// Remove your local video stream preview from your UI
removeLocalVideoStream = async() => {
    try {
        localVideoStreamRenderer.dispose();
        localVideoContainer.style.display = "none";
    } catch (error) {
        console.error(error);
    } 
}

// End the current call
hangUpCallButton.addEventListener("click", async () => {
    // end the current call
    await call.hangUp();
    callStateElement.innerText = '-';
});
