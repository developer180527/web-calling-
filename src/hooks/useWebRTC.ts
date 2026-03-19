import { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTC(user: any) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [callStatus, setCallStatus] = useState<
    "idle" | "calling" | "ringing" | "connected"
  >("idle");
  const [callType, setCallType] = useState<"audio" | "video">("audio");

  const pc = useRef<RTCPeerConnection | null>(null);
  const currentCallId = useRef<string | null>(null);
  const unsubscribes = useRef<(() => void)[]>([]);

  const setupMediaSources = async (type: "audio" | "video") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === "video",
        audio: true,
      });
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error("Error accessing media devices.", error);
      throw error;
    }
  };

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection(servers);

    const remoteMediaStream = new MediaStream();
    setRemoteStream(remoteMediaStream);

    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteMediaStream.addTrack(track);
      });
    };

    pc.current = peerConnection;
    return peerConnection;
  };

  const startCall = async (calleeId: string, type: "audio" | "video") => {
    if (!user) return;
    setCallType(type);
    setCallStatus("calling");

    const stream = await setupMediaSources(type);
    const peerConnection = createPeerConnection();

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    const callDoc = doc(collection(db, "calls"));
    currentCallId.current = callDoc.id;
    setActiveCall({ id: callDoc.id, calleeId, type });

    const offerCandidates = collection(callDoc, "callerCandidates");
    const answerCandidates = collection(callDoc, "calleeCandidates");

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(offerCandidates, event.candidate.toJSON());
      }
    };

    const offerDescription = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offerDescription);

    const callData = {
      callerId: user.uid,
      calleeId,
      status: "calling",
      type,
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      },
      createdAt: Date.now(),
    };

    await setDoc(callDoc, callData);

    // Call backend to send push notification
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callerId: user.uid,
          calleeId,
          type
        }),
      });
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }

    // Listen for answer
    const unsubCall = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        peerConnection.setRemoteDescription(answerDescription);
        setCallStatus("connected");
      }
      if (data?.status === "rejected" || data?.status === "ended") {
        endCall();
      }
    });
    unsubscribes.current.push(unsubCall);

    // Listen for remote ICE candidates
    const unsubICE = onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          peerConnection.addIceCandidate(candidate);
        }
      });
    });
    unsubscribes.current.push(unsubICE);
  };

  const answerCall = async (callId: string) => {
    if (!incomingCall) return;
    setCallType(incomingCall.type);
    setCallStatus("connected");
    setActiveCall(incomingCall);

    const stream = await setupMediaSources(incomingCall.type);
    const peerConnection = createPeerConnection();

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    const callDoc = doc(db, "calls", callId);
    currentCallId.current = callId;

    const offerCandidates = collection(callDoc, "callerCandidates");
    const answerCandidates = collection(callDoc, "calleeCandidates");

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(answerCandidates, event.candidate.toJSON());
      }
    };

    const callData = (await getDoc(callDoc)).data();
    if (!callData) return;

    const offerDescription = callData.offer;
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offerDescription),
    );

    const answerDescription = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer, status: "answered" });

    // Listen for remote ICE candidates
    const unsubICE = onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          peerConnection.addIceCandidate(candidate);
        }
      });
    });
    unsubscribes.current.push(unsubICE);

    // Listen for call end
    const unsubCall = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (data?.status === "ended") {
        endCall();
      }
    });
    unsubscribes.current.push(unsubCall);

    setIncomingCall(null);
  };

  const rejectCall = async (callId: string) => {
    const callDoc = doc(db, "calls", callId);
    await updateDoc(callDoc, { status: "rejected" });
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (currentCallId.current) {
      const callDoc = doc(db, "calls", currentCallId.current);
      try {
        await updateDoc(callDoc, { status: "ended" });
      } catch (e) {
        // Ignore if already deleted or permission denied
      }
    }

    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    setRemoteStream(null);
    setActiveCall(null);
    setCallStatus("idle");
    currentCallId.current = null;

    unsubscribes.current.forEach((unsub) => unsub());
    unsubscribes.current = [];
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "calls"),
      where("calleeId", "==", user.uid),
      where("status", "==", "calling"),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          setIncomingCall({ id: change.doc.id, ...data });
          setCallStatus("ringing");

          // Trigger local notification if permitted and app is in background
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const callerDoc = await getDoc(doc(db, 'users', data.callerId));
              const callerName = callerDoc.exists() ? callerDoc.data().displayName : 'Someone';
              
              const notification = new Notification('Incoming Call', {
                body: `${callerName} is calling you via ${data.type}...`,
                icon: '/icon.svg',
                requireInteraction: true,
                tag: 'incoming-call'
              });
              
              notification.onclick = () => {
                window.focus();
                notification.close();
              };
            } catch (e) {
              console.error('Failed to fetch caller info for notification', e);
            }
          }
        }
        if (change.type === "modified") {
          const data = change.doc.data();
          if (data.status === "ended" || data.status === "rejected") {
            setIncomingCall(null);
            if (callStatus === "ringing") setCallStatus("idle");
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user?.uid, callStatus]);

  return {
    localStream,
    remoteStream,
    incomingCall,
    activeCall,
    callStatus,
    callType,
    startCall,
    answerCall,
    rejectCall,
    endCall,
  };
}
