import { useEffect, useState, useRef } from "react";
import { auth, db, signInWithGoogle, logout } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { Phone, Video, PhoneOff, LogOut, User as UserIcon } from "lucide-react";
import { useWebRTC } from "./hooks/useWebRTC";
import { cn } from "./utils";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [authReady, setAuthReady] = useState(false);

  const {
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
  } = useWebRTC(user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        await setDoc(
          userRef,
          {
            uid: currentUser.uid,
            displayName: currentUser.displayName || "Unknown",
            email: currentUser.email || "",
            photoURL: currentUser.photoURL || "",
            isOnline: true,
            lastSeen: Date.now(),
          },
          { merge: true },
        );
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "users"), where("uid", "!=", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map((doc) => doc.data());
      setUsers(usersList);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle setting offline status on unmount/close
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { isOnline: false, lastSeen: Date.now() });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user]);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-white p-4">
        <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 flex flex-col items-center shadow-2xl border border-zinc-800">
          <div className="w-20 h-20 bg-indigo-500 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20">
            <Phone className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-semibold mb-2 tracking-tight">
            WebCall
          </h1>
          <p className="text-zinc-400 text-center mb-8">
            Connect with anyone, anywhere.
          </p>
          <button
            onClick={signInWithGoogle}
            className="w-full bg-white text-black font-medium py-4 rounded-2xl hover:bg-zinc-200 transition-colors active:scale-[0.98]"
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden select-none">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="w-10 h-10 rounded-full border border-zinc-700"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-zinc-400" />
            </div>
          )}
          <div>
            <h2 className="font-medium leading-tight">{user.displayName}</h2>
            <p className="text-xs text-emerald-400">Online</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content - Contact List */}
      <main className="flex-1 overflow-y-auto p-4 space-y-2">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2">
          Contacts
        </h3>
        {users.length === 0 ? (
          <div className="text-center text-zinc-500 mt-10">
            No contacts found.
          </div>
        ) : (
          users.map((contact) => (
            <div
              key={contact.uid}
              className="flex items-center justify-between p-3 rounded-2xl hover:bg-zinc-900 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  {contact.photoURL ? (
                    <img
                      src={contact.photoURL}
                      alt={contact.displayName}
                      className="w-12 h-12 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                      <UserIcon className="w-6 h-6 text-zinc-400" />
                    </div>
                  )}
                  {contact.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-zinc-950 rounded-full"></div>
                  )}
                </div>
                <div>
                  <h4 className="font-medium text-zinc-100">
                    {contact.displayName}
                  </h4>
                  <p className="text-sm text-zinc-500">{contact.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startCall(contact.uid, "audio")}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 text-emerald-400 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  onClick={() => startCall(contact.uid, "video")}
                  className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 text-indigo-400 transition-colors"
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Incoming Call Overlay */}
      {incomingCall && callStatus === "ringing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 rounded-3xl p-8 flex flex-col items-center shadow-2xl w-full max-w-sm border border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mb-6 animate-pulse">
              {incomingCall.type === "video" ? (
                <Video className="w-10 h-10 text-zinc-400" />
              ) : (
                <Phone className="w-10 h-10 text-zinc-400" />
              )}
            </div>
            <h2 className="text-2xl font-semibold mb-2">Incoming Call</h2>
            <p className="text-zinc-400 mb-8 text-center">
              Someone is calling you via {incomingCall.type}
            </p>
            <div className="flex items-center gap-6 w-full justify-center">
              <button
                onClick={() => rejectCall(incomingCall.id)}
                className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={() => answerCall(incomingCall.id)}
                className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 animate-bounce"
              >
                {incomingCall.type === "video" ? (
                  <Video className="w-6 h-6 text-white" />
                ) : (
                  <Phone className="w-6 h-6 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Overlay */}
      {(callStatus === "calling" || callStatus === "connected") &&
        activeCall && (
          <CallScreen
            localStream={localStream}
            remoteStream={remoteStream}
            callStatus={callStatus}
            callType={callType}
            onEndCall={endCall}
          />
        )}
    </div>
  );
}

function CallScreen({
  localStream,
  remoteStream,
  callStatus,
  callType,
  onEndCall,
}: any) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 flex flex-col">
      {/* Remote Video (Full Screen) */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {callType === "video" ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={cn(
                "w-full h-full object-cover transition-opacity duration-500",
                callStatus === "connected" ? "opacity-100" : "opacity-0",
              )}
            />
            {callStatus !== "connected" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-zinc-800 flex items-center justify-center mb-6 animate-pulse">
                  <UserIcon className="w-10 h-10 text-zinc-500" />
                </div>
                <p className="text-xl font-medium text-white">
                  {callStatus === "calling" ? "Calling..." : "Connecting..."}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-32 h-32 rounded-full bg-zinc-800 flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/10">
              <UserIcon className="w-12 h-12 text-zinc-500" />
            </div>
            <p className="text-2xl font-medium text-white mb-2">
              {callStatus === "calling" ? "Calling..." : "00:00"}
            </p>
            <p className="text-zinc-400">Voice Call</p>
            {/* Hidden audio element for remote stream */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="hidden"
            />
          </div>
        )}

        {/* Local Video (PIP) */}
        {callType === "video" && (
          <div className="absolute top-6 right-6 w-28 h-40 sm:w-32 sm:h-48 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 z-10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover mirror"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="h-32 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0 flex items-center justify-center gap-6 pb-8">
        <button
          onClick={onEndCall}
          className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
        >
          <PhoneOff className="w-6 h-6 text-white" />
        </button>
      </div>
    </div>
  );
}
