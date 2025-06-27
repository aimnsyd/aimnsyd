import * as THREE from './libs/three/three.module.js';
import { GLTFLoader } from './libs/three/jsm/GLTFLoader.js';
import { DRACOLoader } from './libs/three/jsm/DRACOLoader.js';
import { RGBELoader } from './libs/three/jsm/RGBELoader.js';
import { Stats } from './libs/stats.module.js';
import { LoadingBar } from './libs/LoadingBar.js';
import { VRButton } from './libs/VRButton.js';
import { CanvasUI } from './libs/CanvasUI.js';
import { GazeController } from './libs/GazeController.js';
import { XRControllerModelFactory } from './libs/three/jsm/XRControllerModelFactory.js';

class App{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );

		this.assetsPath = './assets/';
		
		this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.01, 500 );
		this.camera.position.set( 0, 1.6, 0 );
		
        this.dolly = new THREE.Object3D();
        this.dolly.position.set(0, 0, 10);
        this.dolly.add( this.camera );
        this.dummyCam = new THREE.Object3D();
        this.camera.add( this.dummyCam );
		
		this.scene = new THREE.Scene();
        this.scene.add( this.dolly );
		
		const ambient = new THREE.HemisphereLight(0xFFFFFF, 0xAAAAAA, 0.8);
		this.scene.add(ambient);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild( this.renderer.domElement );
        this.setEnvironment();
	
        window.addEventListener( 'resize', this.resize.bind(this) );
		
        this.clock = new THREE.Clock();
        this.up = new THREE.Vector3(0,1,0);
        this.origin = new THREE.Vector3();
        this.workingVec3 = new THREE.Vector3();
        this.workingQuaternion = new THREE.Quaternion();
        this.raycaster = new THREE.Raycaster();
		
        this.stats = new Stats();
		container.appendChild( this.stats.dom );
		
		this.loadingBar = new LoadingBar();

        this.loadAmbientSound();

        // Add Canvas UI with toggle button
        const config = {
            panelSize: { height: 0.3 },
            height: 128,
            toggleSound: { position: { top: 20 }, height: 50, fontSize: 40, backgroundColor: "#333", fontColor: "#fff" }
        };

        const content = {
            toggleSound: "🔈 Sound On"
        };

        this.ui = new CanvasUI(content, config);
        this.ui.mesh.position.set(0, 1.5, -2);
        this.scene.add(this.ui.mesh);

        this.soundMuted = false;
        this.ui.updateElement("toggleSound", "🔈 Sound On");
        this.ui.update();

        this.ui.update = () => {
            this.ui.updateElement("toggleSound", this.soundMuted ? "🔇 Muted" : "🔈 Sound On");
        };

        this.ui.element.addEventListener("click", () => {
            this.soundMuted = !this.soundMuted;
            if (this.ambientSound) {
                if (!this.ambientSound.isPlaying && !this.soundMuted) {
                    this.ambientSound.play();
                }
                this.ambientSound.setVolume(this.soundMuted ? 0 : 0.5);
            }
            this.ui.update();
        });

		this.loadCollege();
		
        this.immersive = false;
		
        const self = this;
		
        fetch('./college.json')
            .then(response => response.json())
            .then(obj =>{
                self.boardShown = '';
                self.boardData = obj;
            });
	}
	
    setEnvironment(){
        const loader = new RGBELoader().setDataType( THREE.UnsignedByteType );
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        pmremGenerator.compileEquirectangularShader();
		
        const self = this;
		
        loader.load( './assets/hdr/venice_sunset_1k.hdr', ( texture ) => {
          const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
          pmremGenerator.dispose();

          self.scene.environment = envMap;

        }, undefined, (err)=>{
            console.error( 'An error occurred setting the environment');
        } );
    }

    loadAmbientSound() {
        const listener = new THREE.AudioListener();
        this.camera.add(listener);

        this.audioContext = listener.context;
        this.ambientSound = new THREE.Audio(listener);

        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('./assets/audio/ambient.mp3', (buffer) => {
            this.ambientSound.setBuffer(buffer);
            this.ambientSound.setLoop(true);
            this.ambientSound.setVolume(0.5);
            this.ambientSound.play();
        });

        const resumeAudio = () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log("AudioContext resumed.");
                    if (!this.ambientSound.isPlaying) {
                        this.ambientSound.play();
                    }
                });
            }
        };

        window.addEventListener('click', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);
    }

    loadCollege(){
        const loader = new GLTFLoader().setPath(this.assetsPath);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('./libs/three/js/draco/');
        loader.setDRACOLoader(dracoLoader);

        const self = this;

        loader.load(
            'H2.glb',
            function (gltf) {
                const college = gltf.scene.children[0];
                self.scene.add(college);

                college.traverse(function (child) {
                    if (child.isMesh){
                        if (child.name.indexOf("PROXY") !== -1){
                            child.material.visible = false;
                            self.proxy = child;
                        } else if (child.material.name.indexOf('Glass') !== -1){
                            child.material.opacity = 0.1;
                            child.material.transparent = true;
                        } else if (child.material.name.indexOf("SkyBox") !== -1){
                            const mat1 = child.material;
                            const mat2 = new THREE.MeshBasicMaterial({ map: mat1.map });
                            child.material = mat2;
                            mat1.dispose();
                        }
                    }
                });

                self.loadingBar.visible = false;
            },
            function (xhr){
                self.loadingBar.progress = (xhr.loaded / xhr.total);
            },
            function (error){
                console.log('An error happened loading the college model.');
            }
        );
    }

    resize(){
        if (!this.renderer.xr.isPresenting) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize( window.innerWidth, window.innerHeight );  
        }
    }

    // rest of your code...
}

export { App };
