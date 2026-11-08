// vendor/three-mediapipe-rig/runtime/src/tracking/TrackerManager.ts
import {
  DrawingUtils as DrawingUtils4,
  FilesetResolver
} from "@mediapipe/tasks-vision";
import * as THREE5 from "three/webgpu";

// vendor/three-mediapipe-rig/runtime/src/tracking/PoseTracker.ts
import {
  PoseLandmarker
} from "@mediapipe/tasks-vision";
import * as THREE2 from "three/webgpu";

// vendor/three-mediapipe-rig/runtime/src/tracking/util/lookAt.ts
import { Quaternion, Vector3 } from "three/webgpu";
var poleDir = new Vector3;
var objectPosition = new Vector3;
var XAxis = new Vector3(1, 0, 0);
var XAxisNeg = new Vector3(-1, 0, 0);
var YAxis = new Vector3(0, 1, 0);
var YAxisNeg = new Vector3(0, -1, 0);
var ZAxis = new Vector3(0, 0, 1);
var ZAxisNeg = new Vector3(0, 0, -1);
var pole = new Vector3;
var lookDir = new Vector3;
var v = new Vector3;
var correction = new Quaternion;
var worldQuat = new Quaternion;
function lookAt(object, target, poleTarget, poleAxis = "+x") {
  object.lookAt(target);
  const axis = poleAxis == "+x" ? XAxis : poleAxis == "-x" ? XAxisNeg : poleAxis == "+y" ? YAxis : YAxisNeg;
  object.getWorldPosition(objectPosition);
  object.getWorldQuaternion(worldQuat);
  poleDir.subVectors(poleTarget, objectPosition).normalize();
  pole.copy(axis).applyQuaternion(worldQuat);
  const currentPole = pole;
  const lookAxisDir = lookDir.copy(ZAxis).applyQuaternion(worldQuat);
  const desiredPoleDir = poleDir.clone().addScaledVector(lookAxisDir, -poleDir.dot(lookAxisDir)).normalize();
  const cross = v.crossVectors(currentPole, desiredPoleDir);
  const angle = Math.atan2(cross.dot(lookAxisDir), currentPole.dot(desiredPoleDir));
  correction.setFromAxisAngle(ZAxis, angle);
  object.quaternion.multiply(correction);
}

// vendor/three-mediapipe-rig/runtime/src/tracking/Tracker.ts
import * as THREE from "three/webgpu";
var v2 = new THREE.Vector3;
var A = new THREE.Vector3;
var B = new THREE.Vector3;
var C = new THREE.Vector3;

class Tracker {
  points;
  debugConnections;
  objectGhost;
  root;
  marks = {};
  constructor(points, debugConnections) {
    this.points = points;
    this.debugConnections = debugConnections;
    this.root = new THREE.Object3D;
    this.objectGhost = new Map;
    for (let key in this.points) {
      this.marks[key] = new Mark;
      this.root.add(this.marks[key]);
    }
  }
  updateLandmarks(landmarks, debugLandmarks, debugDrawer) {
    for (let key in this.points) {
      const point = this.points[key];
      const mark = this.marks[key];
      if (mark) {
        if (point instanceof Array) {
          v2.copy(landmarks[point[0]]);
          mark.position.copy(landmarks[point[1]]).sub(v2).divideScalar(2).add(landmarks[point[0]]);
          if (point.length == 4) {
            v2.subVectors(landmarks[point[3]], landmarks[point[2]]).divideScalar(2).add(landmarks[point[2]]).sub(mark.position).divideScalar(2);
            mark.position.add(v2);
          }
        } else {
          mark.position.copy(landmarks[point]);
        }
      }
    }
    if (debugDrawer && debugLandmarks) {
      debugDrawer.drawConnectors(debugLandmarks, this.debugConnections, {
        lineWidth: 1
      });
    }
  }
  getGhost(object) {
    if (!this.objectGhost.has(object)) {
      const o = new Ghost;
      o.position.copy(object.position);
      o.quaternion.copy(object.quaternion);
      object.parent?.add(o);
      this.objectGhost.set(object, o);
    }
    return this.objectGhost.get(object);
  }
  predict(source, drawingUtils) {
    throw new Error("Method 'predict' must be implemented.");
  }
  sync(delta, objects) {
    throw new Error("Method 'sync' must be implemented.");
  }
  test(key) {
    this.marks[key].position.set(1, 2, 3);
  }
  syncObjects(objects, delta, normal) {
    for (const [object, root, target, poleAxis] of objects) {
      this.marks[target].getWorldPosition(B);
      this.marks[root].getWorldPosition(A);
      const offset = B.sub(A);
      object.getWorldPosition(A);
      A.add(offset);
      const objectLookAtGoal = A;
      const polePosition = object.getWorldPosition(B).sub(normal);
      const ghost = this.getGhost(object);
      lookAt(ghost, objectLookAtGoal, polePosition, poleAxis);
      ghost.rotateX(Math.PI / 2);
      object.position.lerp(ghost.position, delta * 4);
      object.quaternion.slerp(ghost.quaternion, delta * 4);
    }
  }
  getBone(rig, name) {
    return rig.getObjectByName(name.replace(/[\.\:]/g, ""));
  }
}

class Mark extends THREE.Mesh {
  _worldPosition = new THREE.Vector3;
  constructor() {
    super(new THREE.SphereGeometry(0.01, 3, 3), new THREE.MeshStandardMaterial({ color: 16711680, wireframe: true }));
    this.add(new THREE.AxesHelper(0.001));
  }
  get worldPosition() {
    this.getWorldPosition(this._worldPosition);
    return this._worldPosition;
  }
}

class Ghost extends THREE.Object3D {
  lerp(target, delta, speed = 8) {
    target.position.lerp(this.position, delta * speed);
    target.quaternion.slerp(this.quaternion, delta * speed);
  }
}

// vendor/three-mediapipe-rig/runtime/src/tracking/util/getRootPosition.ts
function rootPosition(out, object, root) {
  root.worldToLocal(object.getWorldPosition(out));
  return out;
}

// vendor/three-mediapipe-rig/runtime/src/tracking/util/getBoneByName.ts
import { Bone } from "three";

// vendor/three-mediapipe-rig/runtime/src/tracking/util/cleanBoneName.ts
function cleanBoneName(name) {
  return name.replace(/[\.\:]/g, "");
}

// vendor/three-mediapipe-rig/runtime/src/tracking/util/getBoneByName.ts
function getBoneByName(rig, name) {
  let bone;
  name = cleanBoneName(name);
  rig.traverse((o) => {
    if (o.name.indexOf(name) === 0 && o instanceof Bone)
      bone = o;
  });
  if (!bone)
    console.log("Bone not found: ", name, rig.name);
  return bone;
}

// vendor/three-mediapipe-rig/runtime/src/tracking/PoseTracker.ts
async function loadPoseTracker(vision, config) {
  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: config?.modelPath ?? "pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
  return new PoseTracker(poseLandmarker, config);
}
var poseMarks = {
  hips: [24, 23],
  neck: [12, 11],
  leftLeg: 23,
  leftKnee: 25,
  leftFoot: 27,
  leftToes: 31,
  leftArm: 11,
  leftElbow: 13,
  leftWrist: 15,
  rightLeg: 24,
  rightKnee: 26,
  rightFoot: 28,
  rightToes: 32,
  rightArm: 12,
  rightElbow: 14,
  rightWrist: 16,
  head: [8, 7],
  forehead: [5, 2],
  mouth: [10, 9],
  torso: [24, 23, 12, 11],
  leftEar: 7,
  rightEar: 8,
  nose: 0
};
var A2 = new THREE2.Vector3;
var B2 = new THREE2.Vector3;
var C2 = new THREE2.Vector3;
var D = new THREE2.Vector3;
var E = new THREE2.Vector3;
var lookGoal = new THREE2.Vector3;
var poleGoal = new THREE2.Vector3;

class PoseTracker extends Tracker {
  poseLandmarker;
  config;
  _leftWristNormalizedPosition;
  _rightWristNormalizedPosition;
  ignoreLegs = false;
  get leftWristNormalizedPosition() {
    return this._leftWristNormalizedPosition;
  }
  get rightWristNormalizedPosition() {
    return this._rightWristNormalizedPosition;
  }
  constructor(poseLandmarker, config) {
    super(poseMarks, PoseLandmarker.POSE_CONNECTIONS);
    this.poseLandmarker = poseLandmarker;
    this.config = config;
    this.root.scale.y *= -2;
    this.root.scale.z *= -2;
    this.root.scale.x *= 2;
    this.ignoreLegs = config?.ignoreLegs ?? false;
  }
  predict(source, drawingUtils) {
    this.poseLandmarker.detectForVideo(source, performance.now(), (result) => {
      if (result.landmarks.length == 0) {
        return;
      }
      this.updateLandmarks(result.worldLandmarks[0], this.config?.drawLandmarks === false ? undefined : result.landmarks[0], drawingUtils);
      this._leftWristNormalizedPosition = result.landmarks[0][this.points.leftWrist];
      this._rightWristNormalizedPosition = result.landmarks[0][this.points.rightWrist];
    });
  }
  bind(rig, magging) {
    const map = {
      hips: getBoneByName(rig, magging.hips),
      neck: getBoneByName(rig, magging.neck),
      leftArm: getBoneByName(rig, magging.armL),
      leftElbow: getBoneByName(rig, magging.forearmL),
      leftWrist: getBoneByName(rig, magging.handL),
      rightArm: getBoneByName(rig, magging.armR),
      rightElbow: getBoneByName(rig, magging.forearmR),
      rightWrist: getBoneByName(rig, magging.handR),
      head: getBoneByName(rig, magging.head),
      torso: getBoneByName(rig, magging.torso),
      leftLeg: getBoneByName(rig, magging.thighL),
      leftKnee: getBoneByName(rig, magging.shinL),
      leftFoot: getBoneByName(rig, magging.footL),
      rightLeg: getBoneByName(rig, magging.thighR),
      rightKnee: getBoneByName(rig, magging.shinR),
      rightFoot: getBoneByName(rig, magging.footR)
    };
    if (this.config?.ignoreLegs) {
      delete map.leftLeg;
      delete map.leftKnee;
      delete map.leftFoot;
      delete map.leftToes;
      delete map.rightLeg;
      delete map.rightKnee;
      delete map.rightFoot;
      delete map.rightToes;
    }
    const v3 = new THREE2.Vector3;
    const v22 = new THREE2.Vector3;
    const syncBone = (delta, bone, from, to, sideAxis, poleAxis) => {
      if (!bone)
        return;
      const hipsDir = this.marks[to].getWorldPosition(v3).sub(this.marks[from].getWorldPosition(v22)).normalize();
      rootPosition(lookGoal, bone, rig).add(hipsDir).applyMatrix4(rig.matrixWorld);
      rootPosition(poleGoal, bone, rig).add(sideAxis).applyMatrix4(rig.matrixWorld);
      const ghost = this.getGhost(bone);
      lookAt(ghost, lookGoal, poleGoal, poleAxis);
      ghost.rotateX(Math.PI / 2);
      ghost.lerp(bone, delta);
    };
    return {
      update: (delta) => {
        const sideHips = this.marks.leftLeg.getWorldPosition(A2).sub(this.marks.rightLeg.getWorldPosition(B2)).normalize();
        const sideShoulders = this.marks.leftArm.getWorldPosition(B2).sub(this.marks.rightArm.getWorldPosition(C2)).normalize();
        const sideHead = this.marks.leftEar.getWorldPosition(D).sub(this.marks.rightEar.getWorldPosition(E)).normalize();
        syncBone(delta, map.hips, "hips", "torso", sideHips, "+x");
        syncBone(delta, map.torso, "torso", "neck", sideShoulders, "+x");
        syncBone(delta, map.neck, "neck", "head", sideHead, "+x");
        syncBone(delta, map.head, "nose", "forehead", sideHead, "+x");
        syncBone(delta, map.leftArm, "leftArm", "leftElbow", sideShoulders, "-x");
        syncBone(delta, map.leftElbow, "leftElbow", "leftWrist", sideShoulders, "-x");
        syncBone(delta, map.rightArm, "rightArm", "rightElbow", sideShoulders, "-x");
        syncBone(delta, map.rightElbow, "rightElbow", "rightWrist", sideShoulders, "-x");
        if (this.ignoreLegs)
          return;
        syncBone(delta, map.leftLeg, "leftLeg", "leftKnee", sideHips, "+x");
        syncBone(delta, map.leftKnee, "leftKnee", "leftFoot", sideHips, "+x");
        syncBone(delta, map.leftFoot, "leftFoot", "leftToes", sideHips, "+x");
        syncBone(delta, map.rightLeg, "rightLeg", "rightKnee", sideHips, "+x");
        syncBone(delta, map.rightKnee, "rightKnee", "rightFoot", sideHips, "+x");
        syncBone(delta, map.rightFoot, "rightFoot", "rightToes", sideHips, "+x");
      }
    };
  }
}

// vendor/three-mediapipe-rig/runtime/src/tracking/HandTracker.ts
import {
  HandLandmarker
} from "@mediapipe/tasks-vision";
import * as THREE3 from "three/webgpu";
var A3 = new THREE3.Vector2;
var B3 = new THREE3.Vector2;
async function loadHandTracker(vision, config) {
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: config.modelPath ?? "hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });
  const isMyWrist = (myWrist, otherWrist, handWrist) => {
    try {
      A3.copy(myWrist());
      B3.copy(otherWrist());
    } catch (e) {
      console.warn("No pose data... will just be optimitic and say yes to everything.", e);
      return true;
    }
    return A3.distanceTo(handWrist) < B3.distanceTo(handWrist);
  };
  return {
    left: new HandsTracker(landmarker, "Left", isMyWrist.bind(null, config.leftWrist, config.rightWrist), config.drawLandmarks),
    right: new HandsTracker(landmarker, "Right", isMyWrist.bind(null, config.rightWrist, config.leftWrist), config.drawLandmarks)
  };
}
var handMarks = {
  wrist: 0,
  palm: [9, 13],
  thumb1: 1,
  thumb2: 2,
  thumb3: 3,
  thumb4: 4,
  index1: 5,
  index2: 6,
  index3: 7,
  index4: 8,
  middle1: 9,
  middle2: 10,
  middle3: 11,
  middle4: 12,
  ring1: 13,
  ring2: 14,
  ring3: 15,
  ring4: 16,
  pinky1: 17,
  pinky2: 18,
  pinky3: 19,
  pinky4: 20
};
var fingerKeys = {
  thumb: ["thumb1", "thumb2", "thumb3", "thumb4"],
  index: ["index1", "index2", "index3", "index4"],
  middle: ["middle1", "middle2", "middle3", "middle4"],
  ring: ["ring1", "ring2", "ring3", "ring4"],
  pinky: ["pinky1", "pinky2", "pinky3", "pinky4"]
};
var v1 = new THREE3.Vector3;
var v22 = new THREE3.Vector3;
var v3 = new THREE3.Vector3;
var v4 = new THREE3.Vector3;
var v5 = new THREE3.Vector3;
var v6 = new THREE3.Vector3;
var v7 = new THREE3.Vector3;
var currNormal = new THREE3.Vector3;
var currForward = new THREE3.Vector3;
var currSide = new THREE3.Vector3;
var HALF_PI = Math.PI / 2;
var DOWN = new THREE3.Vector3(0, -1, 0);

class HandsTracker extends Tracker {
  handLandmarker;
  side;
  isMyWrist;
  drawLandmarks;
  allowAllDirections = false;
  sign;
  isLeft;
  lookAtPoleAxis;
  constructor(handLandmarker, side, isMyWrist, drawLandmarks = true) {
    super(handMarks, HandLandmarker.HAND_CONNECTIONS);
    this.handLandmarker = handLandmarker;
    this.side = side;
    this.isMyWrist = isMyWrist;
    this.drawLandmarks = drawLandmarks;
    this.sign = this.side == "Left" ? -1 : 1;
    this.isLeft = this.side == "Left";
    this.lookAtPoleAxis = this.sign < 0 ? "+x" : "-x";
    this.root.scale.setScalar(7);
    this.root.scale.y *= -1;
    this.root.scale.z *= -1;
  }
  predict(source, drawingUtils) {
    const result = this.handLandmarker.detectForVideo(source, performance.now());
    if (result.landmarks.length) {
      for (let i = 0;i < result.landmarks.length; i++) {
        const hand = result.landmarks[i];
        const wrist = hand[this.points.wrist];
        const isMyWrist = this.isMyWrist(wrist);
        if (isMyWrist) {
          this.updateLandmarks(result.worldLandmarks[i]);
          if (this.drawLandmarks) {
            drawingUtils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
              color: this.side == "Left" ? "#00FF00" : "#0000FF",
              lineWidth: 4
            });
            drawingUtils.drawLandmarks(hand, { color: this.side == "Left" ? "#00FF00" : "#0000FF", lineWidth: 3, radius: 1 });
          }
          break;
        }
      }
    }
  }
  sync(delta, objects) {
    throw new Error("Not used. Use syncHandBones instead");
  }
  syncHandBones(delta, markToBone, rig) {
    const palmNormal = v1.crossVectors(v22.copy(this.marks.index1.worldPosition).sub(this.marks.wrist.worldPosition), v3.copy(this.marks.pinky1.worldPosition).sub(this.marks.wrist.worldPosition)).normalize();
    const parlmDir = v22.copy(this.marks.palm.worldPosition).sub(this.marks.wrist.worldPosition).normalize();
    const palmSide = v3.copy(this.marks.pinky1.worldPosition).sub(this.marks.index1.worldPosition).normalize();
    if (!this.allowAllDirections && parlmDir.dot(DOWN) > 0.8) {
      return;
    }
    if (markToBone.wrist) {
      const palmLookAt = rootPosition(v4, markToBone.wrist, rig).add(parlmDir).applyMatrix4(rig.matrixWorld);
      const polPosition = rootPosition(v5, markToBone.wrist, rig).sub(palmSide).applyMatrix4(rig.matrixWorld);
      const palmGhost = this.getGhost(markToBone.wrist);
      lookAt(palmGhost, palmLookAt, polPosition, "-y");
      palmGhost.rotateX(HALF_PI);
      palmGhost.lerp(markToBone.wrist, delta);
    }
    this.syncFinger(delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.index, "middle1");
    this.syncFinger(delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.middle, "ring1");
    this.syncFinger(delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.ring, "pinky1");
    this.syncFinger(delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.pinky, "ring1", true);
    this.syncFinger(delta, rig, palmNormal, parlmDir, palmSide, markToBone, fingerKeys.thumb, "index1");
  }
  syncFinger(delta, rig, palmNormal, palmForward, palmSide, markToBone, fingerKeys2, sideGoal, negateSideGoal = false) {
    let signMult = 1;
    for (let i = 0;i < fingerKeys2.length - 1; i++) {
      const bone = markToBone[fingerKeys2[i]];
      if (!bone)
        continue;
      const fingerGhost = this.getGhost(bone);
      const myDir = v4.copy(this.marks[fingerKeys2[i + 1]].worldPosition).sub(this.marks[fingerKeys2[i]].worldPosition).normalize();
      const bonePos = rootPosition(v5, bone, rig);
      if (i == 0) {
        const fingerSideNormal = v6.copy(this.marks[sideGoal].worldPosition).sub(this.marks[fingerKeys2[0]].worldPosition).normalize();
        if (negateSideGoal)
          fingerSideNormal.negate();
        currSide.copy(fingerSideNormal);
        lookAt(fingerGhost, myDir.add(bonePos).applyMatrix4(rig.matrixWorld), fingerSideNormal.add(bonePos).applyMatrix4(rig.matrixWorld), this.lookAtPoleAxis);
      } else {
        lookAt(fingerGhost, myDir.add(bonePos).applyMatrix4(rig.matrixWorld), v6.copy(currSide).add(bonePos).applyMatrix4(rig.matrixWorld), this.lookAtPoleAxis);
      }
      fingerGhost.rotateX(HALF_PI);
      fingerGhost.lerp(bone, delta);
    }
  }
  bind(rig, magging) {
    const map = {};
    const addBind = (boneName, markName) => {
      const bone = getBoneByName(rig, boneName);
      if (bone) {
        map[markName] = bone;
        return markName;
      }
    };
    addBind(this.isLeft ? magging.handL : magging.handR, "wrist");
    addBind(this.isLeft ? magging.index1L : magging.index1R, "index1");
    addBind(this.isLeft ? magging.index2L : magging.index2R, "index2");
    addBind(this.isLeft ? magging.index3L : magging.index3R, "index3");
    addBind(this.isLeft ? magging.middle1L : magging.middle1R, "middle1");
    addBind(this.isLeft ? magging.middle2L : magging.middle2R, "middle2");
    addBind(this.isLeft ? magging.middle3L : magging.middle3R, "middle3");
    addBind(this.isLeft ? magging.ring1L : magging.ring1R, "ring1");
    addBind(this.isLeft ? magging.ring2L : magging.ring2R, "ring2");
    addBind(this.isLeft ? magging.ring3L : magging.ring3R, "ring3");
    addBind(this.isLeft ? magging.pinky1L : magging.pinky1R, "pinky1");
    addBind(this.isLeft ? magging.pinky2L : magging.pinky2R, "pinky2");
    addBind(this.isLeft ? magging.pinky3L : magging.pinky3R, "pinky3");
    addBind(this.isLeft ? magging.thumb1L : magging.thumb1R, "thumb1");
    addBind(this.isLeft ? magging.thumb2L : magging.thumb2R, "thumb2");
    addBind(this.isLeft ? magging.thumb3L : magging.thumb3R, "thumb3");
    return {
      update: (delta) => {
        this.syncHandBones(delta, map, rig);
      }
    };
  }
}

// vendor/three-mediapipe-rig/runtime/src/tracking/FaceTracker.ts
import {
  FaceLandmarker
} from "@mediapipe/tasks-vision";
import { Vector3 as Vector35, VideoTexture, SRGBColorSpace, MeshPhysicalNodeMaterial, Matrix4 } from "three/webgpu";
import { attribute, float, instancedArray, positionLocal, select, texture, uniform, varying, vec2, vec3 } from "three/tsl";

// vendor/three-mediapipe-rig/runtime/src/tracking/util/face-tracker-utils.ts
import { BufferAttribute } from "three";
var FACE_LANDMARKS_COUNT = 478;
var createFaceLandmarksIndexAttribute = (mesh) => {
  if (mesh.geometry.hasAttribute("landmarkIndex"))
    return;
  const geometry = mesh.geometry;
  const posAttr = geometry.attributes.position;
  const uniquePositions = [];
  const seen = new Map;
  const posIndex2LandmarkIndex = [];
  for (let i = 0;i < posAttr.count; i++) {
    const key = Math.round(posAttr.getX(i) * 1e6) + "," + Math.round(posAttr.getY(i) * 1e6) + "," + Math.round(posAttr.getZ(i) * 1e6);
    if (!seen.has(key)) {
      seen.set(key, uniquePositions.length);
      uniquePositions.push(i);
    }
    const idx = seen.get(key);
    posIndex2LandmarkIndex.push(idx < FACE_LANDMARKS_COUNT ? idx : 65535);
  }
  geometry.setAttribute("landmarkIndex", new BufferAttribute(new Float32Array(posIndex2LandmarkIndex), 1));
};

// vendor/three-mediapipe-rig/runtime/src/tracking/FaceTracker.ts
async function loadFaceTracker(vision, cfg) {
  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: cfg?.modelPath ?? "face_landmarker.task",
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1
  });
  return new FaceTracker(faceLandmarker, { ...cfg });
}
var faceMarks = {
  eyeL: 473,
  eyeR: 468,
  eyeStartL: 463,
  eyeStartR: 243,
  eyeEndL: 263,
  eyeEndR: 33,
  earL: 454,
  earR: 234,
  noseTip: 4,
  noseBone: 6,
  chin: 152,
  forehead: 10
};
var v8 = new Vector35;
var v23 = new Vector35;
var v32 = new Vector35;
var v42 = new Vector35;
var v52 = new Vector35;
var v62 = new Vector35;

class FaceTracker extends Tracker {
  faceLandmarker;
  cfg;
  blendshapeCategories;
  blendshapeMap = new Map;
  smoothed = {};
  smoothing = 0.0003;
  _faceLandmarks = [];
  _facialTransformationMatrix;
  constructor(faceLandmarker, cfg) {
    super(faceMarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION);
    this.faceLandmarker = faceLandmarker;
    this.cfg = cfg;
    this.root.scale.y *= -1;
    this.root.scale.z *= -1;
    this.root.scale.multiplyScalar(3);
  }
  predict(frame, drawingUtils) {
    const result = this.faceLandmarker.detectForVideo(frame, performance.now());
    if (result.faceLandmarks[0]) {
      if (this.cfg.drawLandmarks) {
        drawingUtils.drawConnectors(result.faceLandmarks[0], FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#00fff2ff", lineWidth: 0.1 });
        drawingUtils.drawLandmarks(result.faceLandmarks[0], { color: "#00ff00", lineWidth: 0.1, radius: 0.4 });
      }
      this.updateLandmarks(result.faceLandmarks[0], result.faceLandmarks[0]);
      this._faceLandmarks = result.faceLandmarks[0];
      if (!this._facialTransformationMatrix) {
        this._facialTransformationMatrix = new Matrix4;
      }
      const m = result.facialTransformationMatrixes[0];
      this._facialTransformationMatrix.set(m.data[0], m.data[1], m.data[2], m.data[3], m.data[4], m.data[5], m.data[6], m.data[7], m.data[8], m.data[9], m.data[10], m.data[11], m.data[12], m.data[13], m.data[14], m.data[15]);
    }
    this.blendshapeCategories = result.faceBlendshapes?.[0]?.categories;
    this.blendshapeCategories?.forEach((category) => {
      this.blendshapeMap.set(category.categoryName, category.score);
    });
  }
  get lastKnownLandmarks() {
    return this._faceLandmarks;
  }
  get lastKnownFacialTransformationMatrix() {
    return this._facialTransformationMatrix;
  }
  bindShapeKeys(mesh) {
    const meshKeys = mesh.morphTargetDictionary;
    return {
      update: (delta) => {
        this.blendshapeCategories?.forEach((category) => {
          const { categoryName, score } = category;
          if (!meshKeys?.hasOwnProperty(categoryName))
            return;
          if (this.smoothed[categoryName] === undefined)
            this.smoothed[categoryName] = score;
          const factor = 1 - Math.pow(this.smoothing, delta);
          this.smoothed[categoryName] += (score - this.smoothed[categoryName]) * factor;
          mesh.morphTargetInfluences[meshKeys[categoryName]] = this.smoothed[categoryName];
        });
      }
    };
  }
  bind(rig) {
    const eyeL = new EyeRig(rig, "L");
    const eyeR = new EyeRig(rig, "R");
    const headBone = getBoneByName(rig, "head");
    return {
      update: (delta) => {
        eyeL.update(delta, this.blendshapeMap);
        eyeR.update(delta, this.blendshapeMap);
        if (!headBone)
          return;
        const markEarL = v8.copy(this.marks.earL.worldPosition);
        const markEarR = v23.copy(this.marks.earR.worldPosition);
        const headcenter = v32.subVectors(markEarL, markEarR).multiplyScalar(0.5).add(markEarR);
        const headForward = v42.subVectors(this.marks.noseTip.worldPosition, headcenter);
        const headSideNormal = markEarL.sub(markEarR);
        const headPosition = rootPosition(v52, headBone, rig);
        const poleLookAt = headSideNormal.add(headPosition).applyMatrix4(rig.matrixWorld);
        const faceLookAt = headForward.add(headPosition).applyMatrix4(rig.matrixWorld);
        lookAt(headBone, faceLookAt, poleLookAt, "+x");
      }
    };
  }
  bindGeometry(mesh, setupTheMaterialYourself) {
    const A4 = new Vector35;
    const B4 = new Vector35;
    const C3 = new Vector35;
    const D2 = new Vector35;
    const geometry = mesh.geometry;
    const posAttr = geometry.attributes.position;
    const originA = 209;
    const originB = 429;
    const origin = uniform(new Vector35().addVectors(new Vector35(posAttr.getX(originA), posAttr.getY(originA), posAttr.getZ(originA)), new Vector35(posAttr.getX(originB), posAttr.getY(originB), posAttr.getZ(originB))).multiplyScalar(0.5));
    createFaceLandmarksIndexAttribute(mesh);
    const landmarkIndexAttr = attribute("landmarkIndex", "float").toUint();
    const landmarkStore = instancedArray(FACE_LANDMARKS_COUNT, "vec3");
    const sampleUV = varying(landmarkStore.element(landmarkIndexAttr)).xy;
    let video;
    const scaleRefIndexA = 116;
    const scaleRefIndexB = 346;
    const meshFaceReference = C3.subVectors(new Vector35(posAttr.getX(scaleRefIndexA), posAttr.getY(scaleRefIndexA), posAttr.getZ(scaleRefIndexA)), new Vector35(posAttr.getX(scaleRefIndexB), posAttr.getY(scaleRefIndexB), posAttr.getZ(scaleRefIndexB))).lengthSq();
    const geometryScaleReference = uniform(meshFaceReference);
    const landmarkScaleReference = uniform(1);
    let disposeMaterial;
    return {
      disposeMaterial: () => {
        disposeMaterial?.();
      },
      update: (delta) => {
        if (!video) {
          const currentVideo = this.cfg?.videoElementRef?.();
          if (!currentVideo || !currentVideo.videoWidth || !currentVideo.videoHeight)
            return;
          video = currentVideo;
          const tex = new VideoTexture(video);
          tex.colorSpace = SRGBColorSpace;
          const videoRatio = uniform(video.videoWidth / video.videoHeight);
          const landmarkScaleReference2 = landmarkStore.element(scaleRefIndexB).sub(landmarkStore.element(scaleRefIndexA)).lengthSq();
          const ratio = geometryScaleReference.div(landmarkScaleReference2).sqrt();
          const A1 = landmarkStore.element(234).xy;
          const A22 = landmarkStore.element(93).xy;
          const B1 = landmarkStore.element(454).xy;
          const B22 = landmarkStore.element(323).xy;
          const A5 = A1.sub(A22).div(2).add(A22);
          const B5 = B1.sub(B22).div(2).add(B22);
          const center = B5.sub(A5).div(2).add(A5);
          const mediapipePosition = landmarkStore.element(landmarkIndexAttr).sub(center).xzy.mul(vec3(1, -1, float(1).div(videoRatio))).mul(ratio).add(origin);
          const positionNode = select(landmarkIndexAttr.toUint().lessThanEqual(FACE_LANDMARKS_COUNT), mediapipePosition, positionLocal);
          const colorNode = texture(tex, vec2(sampleUV.x, sampleUV.y.oneMinus()));
          const onVideoSourceChanged = () => {
            const tex2 = new VideoTexture(video);
            tex2.colorSpace = SRGBColorSpace;
            colorNode.value = tex2;
            colorNode.needsUpdate = true;
            videoRatio.value = video.videoWidth / video.videoHeight;
          };
          video.addEventListener("loadeddata", onVideoSourceChanged);
          if (setupTheMaterialYourself) {
            setupTheMaterialYourself(positionNode, colorNode);
          } else {
            mesh.material = new MeshPhysicalNodeMaterial({
              positionNode,
              colorNode,
              roughness: 0.93
            });
          }
          disposeMaterial = () => {
            colorNode.value.dispose();
            video?.removeEventListener("loadeddata", onVideoSourceChanged);
            mesh.material?.dispose();
          };
        }
        const landmarks = this.lastKnownLandmarks;
        if (!landmarks?.length)
          return;
        landmarkScaleReference.value = C3.subVectors(landmarks[scaleRefIndexB], landmarks[scaleRefIndexA]).lengthSq();
        landmarkScaleReference.needsUpdate = true;
        const data = landmarkStore.value.array;
        for (let i = 0;i < landmarks.length; i++) {
          data[i * 3] = landmarks[i].x;
          data[i * 3 + 1] = landmarks[i].y;
          data[i * 3 + 2] = landmarks[i].z;
        }
        landmarkStore.value.needsUpdate = true;
      }
    };
  }
}

class EyeRig {
  rig;
  side;
  eyeBone;
  eyeLookOut;
  eyeLookIn;
  eyeLookUp;
  eyeLookDown;
  sign = 1;
  constructor(rig, side) {
    this.rig = rig;
    this.side = side;
    this.eyeBone = rig.getObjectByName(`eye${side}`);
    const sideName = side == "L" ? "Left" : "Right";
    this.eyeLookOut = `eyeLookOut${sideName}`;
    this.eyeLookIn = `eyeLookIn${sideName}`;
    this.eyeLookUp = `eyeLookUp${sideName}`;
    this.eyeLookDown = `eyeLookDown${sideName}`;
    this.sign = side == "L" ? -1 : 1;
  }
  update(delta, blendshapes) {
    if (!this.eyeBone)
      return;
    const eye = rootPosition(v32, this.eyeBone, this.rig);
    const lookLeft = blendshapes.get(this.eyeLookOut) ?? 0;
    const lookRight = blendshapes.get(this.eyeLookIn) ?? 0;
    const lookUp = blendshapes.get(this.eyeLookUp) ?? 0;
    const lookDown = blendshapes.get(this.eyeLookDown) ?? 0;
    const sideMovement = lookRight - lookLeft;
    const verticalMovement = lookDown - lookUp;
    this.eyeBone.rotation.y = sideMovement * this.sign / 2;
    this.eyeBone.rotation.x = verticalMovement / 2;
  }
}

// vendor/three-mediapipe-rig/runtime/src/tracking/BoneMapping.ts
var defaultBoneMap = {
  faceMesh: "face",
  head: "head",
  hips: "hips",
  neck: "neck",
  torso: "torso",
  armL: "upper_armL",
  forearmL: "forearmL",
  armR: "upper_armR",
  forearmR: "forearmR",
  thighL: "thighL",
  shinL: "shinL",
  footL: "footL",
  toesL: "toesL",
  thighR: "thighR",
  shinR: "shinR",
  footR: "footR",
  toesR: "toesR",
  handL: "handL",
  index1L: "index1L",
  index2L: "index2L",
  index3L: "index3L",
  middle1L: "middle1L",
  middle2L: "middle2L",
  middle3L: "middle3L",
  ring1L: "ring1L",
  ring2L: "ring2L",
  ring3L: "ring3L",
  pinky1L: "pinky1L",
  pinky2L: "pinky2L",
  pinky3L: "pinky3L",
  thumb1L: "thumb1L",
  thumb2L: "thumb2L",
  thumb3L: "thumb3L",
  handR: "handR",
  index1R: "index1R",
  index2R: "index2R",
  index3R: "index3R",
  middle1R: "middle1R",
  middle2R: "middle2R",
  middle3R: "middle3R",
  ring1R: "ring1R",
  ring2R: "ring2R",
  ring3R: "ring3R",
  pinky1R: "pinky1R",
  pinky2R: "pinky2R",
  pinky3R: "pinky3R",
  thumb1R: "thumb1R",
  thumb2R: "thumb2R",
  thumb3R: "thumb3R"
};

// vendor/three-mediapipe-rig/runtime/src/tracking/recoding/recorder.ts
import * as THREE4 from "three";
import { GLTFExporter } from "three/examples/jsm/Addons.js";

// vendor/three-mediapipe-rig/runtime/src/tracking/blendShapeKeyNames.ts
var blendShapeKeyNames = [
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "tongueOut"
];

// vendor/three-mediapipe-rig/runtime/src/tracking/recoding/recorder.ts
function createRigRecorder(rigRoot, magging, fps = 30) {
  const bones = [];
  const faceMesh = rigRoot.getObjectByName(magging.faceMesh);
  const usedBlendShapeKeys = new Set;
  if (faceMesh?.morphTargetDictionary) {
    for (const key in faceMesh.morphTargetDictionary) {
      if (blendShapeKeyNames.includes(key)) {
        usedBlendShapeKeys.add(key);
      }
    }
  }
  const boneKeys = Object.keys(magging);
  rigRoot.traverse((o) => {
    if (o instanceof THREE4.Bone) {
      const key = boneKeys.find((k) => o.name.indexOf(magging[k]) === 0);
      if (key) {
        bones.push({
          ref: o,
          name: o.name,
          normalizedName: key
        });
      }
    }
  });
  const times = [];
  const boneTracks = new Map;
  const blendShapeTracks = new Map;
  let recording = false;
  let startTime = 0;
  let _fps = 0;
  let timeSinceLastCapture = 0;
  let frameTime = 0;
  function start(fps2) {
    boneTracks.clear();
    blendShapeTracks.clear();
    times.length = 0;
    _fps = fps2 ?? 0;
    frameTime = _fps > 0 ? 1 / _fps : 0;
    startTime = performance.now() / 1000;
    recording = true;
    timeSinceLastCapture = 0;
  }
  function captureFrame() {
    if (!recording)
      return;
    const time = performance.now() / 1000 - startTime;
    if (_fps > 0 && time - timeSinceLastCapture < frameTime) {
      return;
    }
    timeSinceLastCapture = time;
    times.push(time);
    for (const bone of bones) {
      if (!boneTracks.has(bone.name)) {
        boneTracks.set(bone.name, []);
      }
      const track = boneTracks.get(bone.name);
      const q = bone.ref.quaternion;
      track.push(q.x, q.y, q.z, q.w);
    }
    for (const key of usedBlendShapeKeys) {
      if (!blendShapeTracks.has(key)) {
        blendShapeTracks.set(key, []);
      }
      const track = blendShapeTracks.get(key);
      const keyIndex = faceMesh.morphTargetDictionary[key];
      const v9 = faceMesh.morphTargetInfluences[keyIndex];
      track.push(v9);
    }
  }
  function stop(name = "RecordedClip") {
    recording = false;
    const keyframeTracks = [];
    for (const [boneName, data] of boneTracks) {
      keyframeTracks.push(new THREE4.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, data));
    }
    for (const [key, data] of blendShapeTracks) {
      keyframeTracks.push(new THREE4.NumberKeyframeTrack(`${defaultBoneMap.faceMesh}.morphTargetInfluences[${key}]`, times, data));
    }
    const clip = new THREE4.AnimationClip(name, -1, keyframeTracks);
    return {
      clip,
      saveToFile: () => new Promise((resolve, reject) => {
        const exporter = new GLTFExporter;
        exporter.parse(rigRoot, (gltf) => {
          const blob = new Blob([gltf], {
            type: "model/gltf-binary"
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name + ".glb";
          a.click();
          resolve(true);
        }, (error) => {
          console.error(error);
          reject(error);
        }, {
          binary: true,
          animations: [clip]
        });
      })
    };
  }
  return { start, captureFrame, stop, isRecording: () => recording };
}

// vendor/three-mediapipe-rig/runtime/src/tracking/TrackerManager.ts
var hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
async function setupTracker(config) {
  const $cfg = {
    debugFrame: undefined,
    displayScale: 1,
    ignoreLegs: false,
    debugVideo: undefined,
    ignoreFace: false,
    onlyFace: false,
    drawLandmarksOverlay: true,
    modelPaths: {
      vision: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
      pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    },
    ...config
  };
  let video;
  const vision = await FilesetResolver.forVisionTasks($cfg.modelPaths.vision ?? "/wasm");
  const poseTracker = $cfg.onlyFace ? undefined : await loadPoseTracker(vision, {
    ignoreLegs: $cfg.ignoreLegs,
    modelPath: $cfg.modelPaths.pose,
    drawLandmarks: $cfg.drawLandmarksOverlay
  });
  const handsTracker = $cfg.onlyFace ? undefined : await loadHandTracker(vision, {
    leftWrist: () => poseTracker.leftWristNormalizedPosition,
    rightWrist: () => poseTracker.rightWristNormalizedPosition,
    modelPath: $cfg.modelPaths.hand,
    drawLandmarks: $cfg.drawLandmarksOverlay,
    ...config?.handsTrackerOptions
  });
  const faceTracker = $cfg.ignoreFace ? undefined : await loadFaceTracker(vision, { modelPath: $cfg.modelPaths.face, videoElementRef: () => video, drawLandmarks: $cfg.drawLandmarksOverlay });
  const viewport = document.createElement("div");
  viewport.style.position = "absolute";
  viewport.style.top = "0px";
  viewport.style.left = "0px";
  viewport.style.zIndex = "21";
  viewport.style.maxWidth = "600px";
  viewport.style.width = "100%";
  viewport.classList.add("three-mediapipe-rig");
  document.body.appendChild(viewport);
  const canvasElement = document.createElement("canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const drawingUtils = new DrawingUtils4(canvasCtx);
  canvasElement.style.zIndex = "22";
  canvasElement.style.position = "absolute";
  canvasElement.style.top = "0px";
  canvasElement.style.left = "0px";
  canvasElement.style.pointerEvents = "none";
  canvasElement.style.maxWidth = "100%";
  viewport.appendChild(canvasElement);
  function predict(source) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    poseTracker?.predict(source, drawingUtils);
    handsTracker?.left.predict(source, drawingUtils);
    handsTracker?.right.predict(source, drawingUtils);
    faceTracker?.predict(source, drawingUtils);
    canvasCtx.restore();
  }
  function initializeVideo() {
    video = document.createElement("video");
    viewport.appendChild(video);
    let lastVideoTime = -1;
    video.style.zIndex = "21";
    video.style.position = "absolute";
    video.style.top = "0px";
    video.style.left = "0px";
    video.style.height = "auto";
    video.style.maxWidth = "100%";
    video.style.display = "block";
    video.muted = false;
    if ($cfg.debugVideo) {
      video.src = $cfg.debugVideo;
      video.controls = true;
      video.loop = true;
      video.muted = true;
      video.controls = true;
      video.play();
    }
    function predictWebcam() {
      if (lastVideoTime !== video.currentTime && video.readyState >= 2) {
        predict(video);
        lastVideoTime = video.currentTime;
      }
      window.requestAnimationFrame(predictWebcam);
    }
    video.addEventListener("loadeddata", () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const maxW = 600;
      const maxH = 600;
      const scale = Math.min(maxW / vw, maxH / vh, 1);
      video.width = vw * scale * ($cfg.displayScale ?? 1);
      video.height = vh * scale * ($cfg.displayScale ?? 1);
      canvasElement.width = video.width;
      canvasElement.height = video.height;
      canvasElement.style.height = "auto";
      canvasElement.style.width = video.width + "px";
      canvasElement.style.maxWidth = "100%";
      window.requestAnimationFrame(predictWebcam);
    });
  }
  if ($cfg.debugFrame) {
    const img = document.createElement("img");
    img.src = $cfg.debugFrame;
    img.style.zIndex = "21";
    img.style.position = "absolute";
    img.style.top = "0px";
    img.style.left = "0px";
    viewport.appendChild(img);
    img.addEventListener("load", () => {
      img.width = img.naturalWidth * $cfg.displayScale;
      img.height = img.naturalHeight * $cfg.displayScale;
      canvasElement.width = img.naturalWidth;
      canvasElement.height = img.naturalWidth;
      canvasElement.style.width = img.width + "px";
      canvasElement.style.height = img.height + "px";
      function predictFrame() {
        predict(img);
      }
      window.requestAnimationFrame(predictFrame);
    });
  } else if ($cfg.debugVideo) {
    initializeVideo();
  }
  let webcamStopper;
  function setEnabled(enabled) {
    if (!video)
      return;
    if (video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach((t) => t.enabled = enabled);
    } else {
      if (enabled)
        video.play();
      else
        video.pause();
    }
  }
  return {
    poseTracker,
    handsTracker,
    faceTracker,
    video,
    canvas: canvasElement,
    domElement: viewport,
    start: async (withAudio = false) => {
      let stopped = false;
      if (!hasGetUserMedia()) {
        throw new Error("Webcam not supported");
      }
      if (!video) {
        initializeVideo();
      }
      let stream;
      function onTrackEnded(video2) {
        if (stopped)
          return;
        console.warn("Camera track ended, attempting recovery...");
        stopCamera(video2);
        retryWithBackoff(video2);
      }
      function stopCamera(video2) {
        stream?.getVideoTracks().forEach((t) => t.stop());
        stream = undefined;
        video2.srcObject = null;
      }
      async function retryWithBackoff(video2, attempt = 0) {
        const MAX_ATTEMPTS = 3;
        const delay = Math.min(1000 * 2 ** attempt, 16000);
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error("Camera recovery failed after max attempts");
        }
        await new Promise((res) => setTimeout(res, delay));
        if (stopped)
          return;
        try {
          await startCamera(video2);
        } catch (err) {
          await handleCameraError(err, video2, attempt + 1);
        }
      }
      async function startCamera(video2) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
        video2.srcObject = stream;
        await video2.play();
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => onTrackEnded(video2));
        });
      }
      async function handleCameraError(err, video2, attempt = 0) {
        if (err instanceof DOMException) {
          switch (err.name) {
            case "NotAllowedError":
              throw new Error("Permission denied — prompt user to allow camera");
            case "NotFoundError":
              console.error("No camera found — retry when device is connected");
              await retryWithBackoff(video2, attempt + 1);
              break;
            case "NotReadableError":
              throw new Error("Camera in use by another app");
            default:
              throw new Error("Camera error: " + err.message);
          }
        } else {
          throw new Error("Unknown camera error: " + err);
        }
      }
      await retryWithBackoff(video);
      webcamStopper = () => {
        stopped = true;
        stopCamera(video);
        webcamStopper = undefined;
      };
      return {
        getStream: () => stream,
        stop: webcamStopper
      };
    },
    pause: () => {
      setEnabled(false);
    },
    resume: () => {
      setEnabled(true);
    },
    bind: (rig, magging) => {
      magging = magging || defaultBoneMap;
      if (!poseTracker)
        throw new Error("Pose tracker not initialized");
      if (!handsTracker)
        throw new Error("Hands tracker not initialized");
      const bodyBindin = poseTracker.bind(rig, magging);
      const leftHandBinding = handsTracker.left.bind(rig, magging);
      const rightHandBinding = handsTracker.right.bind(rig, magging);
      let faceKeys;
      const faceRig = faceTracker?.bind(rig);
      rig.traverse((child) => {
        if (child instanceof THREE5.Mesh && child.name.indexOf(magging.faceMesh) === 0) {
          child.frustumCulled = false;
          faceKeys = faceTracker?.bindShapeKeys(child);
        }
      });
      const recorder = createRigRecorder(rig, magging);
      return {
        startRecording: recorder.start,
        stopRecording: recorder.stop,
        isRecording: () => recorder.isRecording(),
        update: (delta) => {
          bodyBindin.update(delta);
          leftHandBinding.update(delta);
          rightHandBinding.update(delta);
          faceKeys?.update(delta);
          faceRig?.update(delta);
          if (recorder.isRecording()) {
            recorder.captureFrame();
          }
        }
      };
    },
    setVideoFromSource: (source) => {
      webcamStopper?.();
      if (!video) {
        initializeVideo();
      }
      video.src = source instanceof File ? URL.createObjectURL(source) : source;
      video.controls = true;
      video.loop = true;
      video.muted = true;
      video.controls = true;
      video.play();
    },
    async setVideoFromWebcam(withAudio = false) {
      if (!video) {
        initializeVideo();
      }
      if (webcamStopper) {
        throw new Error("Webcam already started");
      }
      return await this.start(withAudio);
    }
  };
}
// vendor/three-mediapipe-rig/runtime/editor.ts
class EditorHandsTracker extends HandsTracker {
  constructor(side) {
    super(null, side, () => false, false);
    this.allowAllDirections = true;
  }
  acceptLandmarks(landmarks) {
    this.updateLandmarks(landmarks);
  }
  predict() {
    throw new Error("EditorHandsTracker accepts existing detector results through acceptLandmarks()");
  }
}
export {
  setupTracker,
  loadPoseTracker,
  loadHandTracker,
  loadFaceTracker,
  defaultBoneMap,
  createFaceLandmarksIndexAttribute,
  PoseTracker,
  HandsTracker,
  FaceTracker,
  FACE_LANDMARKS_COUNT,
  EditorHandsTracker
};
