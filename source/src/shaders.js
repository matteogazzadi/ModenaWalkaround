// ---------------------------------------------------------------------------
// GLSL. One shader draws every surface of the city: the material id picks a
// procedural texture (stone, plaster with windows, roof tiles, cobbles...), then
// sun + sky + street lamps light it, then aerial haze fades it into the sky.
// ---------------------------------------------------------------------------
const GLSL_COMMON = /*glsl*/`
float h1(float n){return fract(sin(n*127.1)*43758.5453);}
float h2(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.07+vec2(17.1,9.3);a*=.5;}return s;}
vec3 lin(vec3 c){return pow(max(c,0.),vec3(2.2));}
`;

const VS_MAIN = /*glsl*/`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aT;
layout(location=3) in vec3 aC; layout(location=4) in vec2 aM; layout(location=5) in vec4 aQ;
uniform mat4 uVP;
out vec3 vP; out vec3 vN; out vec2 vT; out vec3 vC; flat out vec2 vM; flat out vec4 vQ;
void main(){vP=aP;vN=aN;vT=aT;vC=aC;vM=aM;vQ=aQ;gl_Position=uVP*vec4(aP,1.);}`;

const FS_MAIN = /*glsl*/`#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vP; in vec3 vN; in vec2 vT; in vec3 vC; flat in vec2 vM; flat in vec4 vQ;
uniform vec3 uCam,uSun,uSunC,uSky,uHor,uGnd; uniform float uTime,uNight,uFog,uExpo; uniform vec2 uClock;
uniform sampler2DShadow uSh; uniform mat4 uShM; uniform vec2 uShT; uniform sampler2D uAO;
uniform vec4 uL[24]; uniform int uNL;
out vec4 oC;
${GLSL_COMMON}
const vec3 LAMPC=vec3(1.,.66,.36);
// coverage of a box given signed distances (negative = inside)
float inBox(vec2 d,float fw){return 1.-smoothstep(-fw,fw,max(d.x,d.y));}

vec3 brick(vec2 t){
  float r=floor(t.y/.075);vec2 f=vec2(fract(t.x/.26+r*.5),fract(t.y/.075));
  float m=step(.06,f.x)*step(.12,f.y);float id=h2(vec2(floor(t.x/.26+r*.5),r));
  return mix(vec3(.5,.45,.4),mix(vec3(.55,.25,.15),vec3(.66,.36,.22),id),m);
}

// Window grid on plastered facades. Returns albedo, writes height, specular and glow.
vec3 windows(vec2 t,vec3 wall,float fw,inout float hgt,inout float spec,inout vec3 emi){
  float cw=vQ.x,ww=vQ.y,fh=vQ.z,sd=vQ.w;
  vec2 cell=vec2(floor(t.x/cw),floor(t.y/fh));
  vec2 f=vec2(t.x-(cell.x+.5)*cw,t.y-cell.y*fh);
  float wh=min(fh*.58,ww*1.85),sill=fh*.26,cy=sill+wh*.5;
  float r=h2(cell+sd*1.31),r2=h2(cell*1.7+sd);
  vec3 c=wall;
  // string course at each floor
  float sc=inBox(vec2(.0,abs(f.y-.12)-.1),fw);
  c=mix(c,wall*1.12,sc*.7);
  // stone/stucco surround and sill
  vec2 d=vec2(abs(f.x)-ww*.5,abs(f.y-cy)-wh*.5);
  float fr=inBox(d-.13,fw), win=inBox(d,fw);
  float sl=inBox(vec2(abs(f.x)-ww*.5-.2,abs(f.y-sill+.07)-.07),fw);
  vec3 surr=mix(vec3(.88,.84,.76),wall*1.25,.35);
  c=mix(c,surr,max(fr,sl));
  hgt+=max(fr,sl)*.35;
  vec3 shc=mix(vec3(.16,.27,.17),vec3(.3,.2,.12),step(.62,fract(sd*.37)));
  shc=mix(shc,vec3(.36,.38,.32),step(.88,fract(sd*.37)));
  float slat=mix(.55+.45*smoothstep(.2,.8,fract(f.y/.055)),.78,smoothstep(.008,.025,fw));
  bool lit=r2<.3;
  if(r<.42){ // closed shutters
    vec3 s=lin(shc)*slat*(.9+.2*h2(cell+3.));
    s=mix(s,s*.5,inBox(vec2(abs(f.x)-.015,abs(f.y-cy)-wh*.5),fw));
    c=mix(c,s,win);hgt=mix(hgt,-.2+slat*.15,win);
    if(lit)emi+=win*LAMPC*.06*(1.-slat)*uNight;
  }else{
    // open: shutter leaves folded against the wall either side
    vec2 dl=vec2(abs(abs(f.x)-ww*.75-.13)-ww*.25,abs(f.y-cy)-wh*.5);
    float lv=inBox(dl,fw)*step(r,.88);
    c=mix(c,lin(shc)*slat,lv);hgt+=lv*.25;
    // glass and the dark room behind it
    float frame=inBox(vec2(abs(f.x)-ww*.5,abs(f.y-cy)-wh*.5),fw)-inBox(vec2(abs(f.x)-ww*.5+.07,abs(f.y-cy)-wh*.5+.07),fw);
    float mull=inBox(vec2(abs(f.x)-.03,abs(f.y-cy)-wh*.5),fw)+inBox(vec2(abs(f.x)-ww*.5,abs(f.y-cy-wh*.12)-.03),fw);
    vec3 g=vec3(.03,.035,.04)+vec3(.05,.04,.03)*h2(cell+9.);
    float curtain=step(.6,h2(cell+5.))*smoothstep(.05,.0,abs(f.x)-ww*.2)*.0;
    c=mix(c,g,win);
    c=mix(c,vec3(.75,.72,.65),clamp(frame+mull,0.,1.)*win);
    spec=mix(spec,1.,win*(1.-clamp(frame+mull,0.,1.)));
    hgt=mix(hgt,-.5,win);
    if(lit)emi+=win*(1.-clamp(frame+mull,0.,1.))*LAMPC*(1.2+h2(cell+11.))*uNight*(1.-curtain);
  }
  return c;
}

// shop fronts and doors on the ground floor
vec3 shops(vec2 t,vec3 wall,float fw,inout float hgt,inout float spec,inout vec3 emi){
  float cw=vQ.x,gh=vQ.z,sd=vQ.w;
  float id=floor(t.x/cw);float fx=t.x-(id+.5)*cw;
  float r=h2(vec2(id,sd)),r2=h2(vec2(sd,id+4.));
  float ow=min(cw*.62,2.6),oh=min(gh-1.,3.1);
  vec2 d=vec2(abs(fx)-ow*.5,abs(t.y-oh*.5)-oh*.5);
  float o=inBox(d,fw),fr=inBox(d-.12,fw);
  vec3 c=mix(wall,wall*.8,fr);
  vec3 g;
  if(r<.18){ // roller shutter, closed
    g=vec3(.32,.33,.34)*mix(.75+.25*smoothstep(.3,.7,fract(t.y/.09)),.87,smoothstep(.01,.03,fw));
    hgt=mix(hgt,-.1,o);
  }else if(r<.35){ // big wooden door
    g=lin(vec3(.36,.22,.12))*(.8+.2*smoothstep(.0,.2,fract(fx/.22)));
    g*=1.-.5*inBox(vec2(abs(fx)-.02,d.y),fw);
    hgt=mix(hgt,-.2,o);
  }else{ // shop window with a lit interior
    float mull=inBox(vec2(abs(fx)-.04,d.y),fw)+inBox(vec2(d.x,abs(t.y-.45)-.45),fw);
    vec3 inside=vec3(.06,.05,.04)+vec3(.12,.08,.05)*vn(vec2(fx*3.,t.y*2.)+r*40.);
    g=mix(inside,lin(vec3(.2,.17,.14)),clamp(mull,0.,1.));
    spec=mix(spec,1.,o*(1.-clamp(mull,0.,1.)));
    float shelf=.55+.45*smoothstep(.1,.3,fract(t.y/.45))*step(.5,t.y);
    emi+=o*(1.-clamp(mull,0.,1.))*LAMPC*(.035+.9*uNight)*(r2<.7?1.:0.12)*(.5+.8*vn(vec2(fx*2.,t.y*2.)+r*9.))*shelf;
    hgt=mix(hgt,-.4,o);
  }
  return mix(c,g,o);
}

vec3 stone(vec2 t,float fw,inout float hgt){
  float rh=.42+.2*h1(floor(t.y/.62)*3.3),r=floor(t.y/rh),rr=h1(r*1.71+3.1);
  float bl=.9+rr*1.1,x=t.x/bl+rr*13.7,cx=floor(x);
  vec2 f=vec2(fract(x)*bl,fract(t.y/rh)*rh);
  float e=min(min(f.x,bl-f.x),min(f.y,rh-f.y));
  float m=smoothstep(.004,.01+fw*1.5,e);
  float id=h2(vec2(cx,r));
  vec3 c=vec3(.84,.8,.72);
  c=mix(c,vec3(.88,.86,.82),step(.45,id));
  c=mix(c,vec3(.78,.73,.64),step(.8,id));
  c=mix(c,vec3(.86,.76,.66),step(.92,id));
  float n=fbm(t*vec2(1.2,1.8)+id*9.);
  c*=(.88+.2*n)*(.96+.08*h2(vec2(cx,r)+7.));
  float fade=smoothstep(.025,.12,fw);
  hgt+=mix(m*(.7+.3*n),.6,fade);
  return mix(c*mix(.78,1.,m),c*.97,fade)*.9;
}

vec3 tiles(vec2 t,float fw,inout float hgt){
  float x=t.x/.2,row=floor(t.y/.4),ix=floor(x),fx=fract(x),fy=fract(t.y/.4);
  float cap=mod(ix,2.);
  float prof=sin(fx*3.14159);
  float id=h2(vec2(ix,row)+vQ.w*31.);
  vec3 c=mix(vec3(.6,.3,.17),vec3(.7,.42,.26),id);
  c=mix(c,vec3(.48,.26,.17),step(.8,h2(vec2(ix*3.,row)+vQ.w)));
  c*=.75+.35*fbm(t*.35+vQ.w*20.);
  c=mix(c,vec3(.42,.42,.32),smoothstep(.62,.8,fbm(t*.8+vQ.w*7.))*.6); // lichen
  float sh=mix(.55,1.,smoothstep(0.,.3,fy))*mix(.75,1.,cap);
  float fade=smoothstep(.015,.07,fw);
  hgt+=mix(prof*mix(.4,1.,cap)+fy*.2,.5,fade);
  return c*mix(sh*(.75+.25*prof),.82,fade);
}

vec3 setts(vec2 t,float fw,inout float hgt,float sz){
  float r=floor(t.y/sz),x=t.x/sz+h1(r)*.7,cx=floor(x);
  vec2 f=vec2(fract(x),fract(t.y/sz));
  float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
  float m=smoothstep(.03,.1+fw*2./sz,e);
  float id=h2(vec2(cx,r));
  vec3 c=mix(vec3(.36,.31,.29),vec3(.47,.41,.37),id);
  c=mix(c,vec3(.3,.29,.3),step(.78,id));
  c*=.85+.3*vn(t*1.3);
  float fade=smoothstep(.015,.06,fw);
  hgt+=mix(m*(.5+.5*sin(f.x*3.14)*sin(f.y*3.14)),.5,fade);
  return mix(c*mix(.45,1.,m),c*.85,fade);
}

vec3 slabs(vec2 t,float fw,inout float hgt){
  float r=floor(t.y/.7),x=t.x/1.15+mod(r,2.)*.5,cx=floor(x);
  vec2 f=vec2(fract(x)*1.15,fract(t.y/.7)*.7);
  float e=min(min(f.x,1.15-f.x),min(f.y,.7-f.y));
  float m=smoothstep(.005,.012+fw*1.5,e);
  float id=h2(vec2(cx,r));
  vec3 c=mix(vec3(.62,.58,.53),vec3(.72,.67,.6),id);
  c=mix(c,vec3(.68,.57,.5),step(.88,id));
  // bands of darker stone every few metres
  float band=inBox(vec2(.0,abs(fract(t.x/9.)-.5)*9.-.3),fw);
  c=mix(c,vec3(.5,.46,.42),band*.7);
  c*=.88+.2*fbm(t*.8);
  float fade=smoothstep(.02,.09,fw);
  hgt+=mix(m,.9,fade)*.6;
  return mix(c*mix(.7,1.,m),c*.96,fade);
}

void main(){
  int mat=int(vM.x+.5);
  vec2 t=vT;
  vec2 dt=fwidth(t);float fw=max(dt.x,dt.y);
  vec3 a=lin(vC),emi=vec3(0);float hgt=0.,spec=.0,rough=.4,bump=.6;
  vec3 wall=a;
  if(mat==0||mat==1||mat==2){
    float n=fbm(t*.6+vQ.w),n2=vn(t*7.);
    wall=a*(.82+.3*n)*(.95+.08*n2);
    float peel=smoothstep(.68,.73,fbm(t*.45+vQ.w*3.+7.))*(1.-smoothstep(1.,4.,vP.y));
    wall=mix(wall,lin(brick(t)),peel);
    hgt=n2*.25-peel*.4;
    a=wall;
    if(mat==1)a=windows(t,wall,fw,hgt,spec,emi);
    if(mat==2)a=shops(t,wall,fw,hgt,spec,emi);
    bump=.5;
  }else if(mat==3){a=lin(stone(t,fw,hgt));bump=.9;}
  else if(mat==4){
    float v=fbm(t*vec2(3.,1.5));float vein=smoothstep(.02,.0,abs(fbm(t*2.+v*3.)-.5));
    a=lin(vC*(.9+.15*v))*(1.-.25*vein);spec=.35;hgt=v*.2;bump=.3;
  }
  else if(mat==5)a=lin(brick(t));
  else if(mat==6){a=lin(tiles(t,fw,hgt));bump=1.;}
  else if(mat==7){
    float seam=inBox(vec2(abs(fract(t.x/.62)-.5)*.62-.025,0.),fw);
    a=vec3(.18,.19,.2)*(.75+.45*fbm(t*.5))*mix(1.,1.25,seam);a=mix(a,vec3(.2,.21,.17),fbm(t*2.)*.4);
    hgt=seam;spec=.25;bump=.8;
  }
  else if(mat==8){a=lin(setts(t,fw,hgt,.12));bump=1.;}
  else if(mat==9){a=lin(slabs(t,fw,hgt));bump=.6;spec=.015;}
  else if(mat==10){a=vec3(.012,.011,.01);}
  else if(mat==11){float pl=smoothstep(.0,.08,fract(t.x/.16))*.3+.7;a=lin(vC)*pl*(.8+.3*vn(vec2(t.x*20.,t.y*.6)));hgt=pl;}
  else if(mat==12){ // rose window
    float r=length(t);if(r>1.)discard;
    float an=atan(t.y,t.x)/6.28318+.5;float sc=fract(an*16.);
    float spoke=smoothstep(.035,.02,abs(sc-.5)*6.28318/16.*r)*step(.22,r)*step(r,.84);
    vec2 q=vec2((sc-.5)*6.28318/16.*.84,r-.74);float arc=smoothstep(.012,.0,abs(length(q)-.07))*step(.74,r);
    float ring=step(.92,r)+step(abs(r-.84),.025)+step(r,.22)+step(abs(r-.5),.012);
    float st=clamp(spoke+ring+arc,0.,1.);
    vec3 glass=vec3(.02,.025,.035)+vec3(.04,.02,.06)*vn(t*12.);
    a=mix(glass,lin(vec3(.88,.84,.76)),st);spec=1.-st;hgt=st;emi+=(1.-st)*uNight*vec3(.9,.5,.25)*.5;
  }
  else if(mat==13){ // clock face
    float r=length(t);if(r>1.)discard;
    vec3 dial=lin(vec3(.12,.2,.42));
    float tick=0.;float an=atan(t.x,t.y);float s=fract(an/6.28318*12.+.5)-.5;
    tick=smoothstep(.06,.03,abs(s))*step(.74,r)*step(r,.9);
    float ring=step(.93,r)+step(abs(r-.7),.012);
    vec2 hd=vec2(sin(uClock.x),cos(uClock.x)),md=vec2(sin(uClock.y),cos(uClock.y));
    float hh=step(abs(dot(t,vec2(hd.y,-hd.x))),.045)*step(-.08,dot(t,hd))*step(dot(t,hd),.48);
    float mh=step(abs(dot(t,vec2(md.y,-md.x))),.028)*step(-.1,dot(t,md))*step(dot(t,md),.78);
    float gold=clamp(tick+ring+hh+mh+step(r,.05),0.,1.);
    a=mix(dial,lin(vec3(.85,.65,.3)),gold);spec=gold*.6;emi+=uNight*a*.6;
  }
  else if(mat==14){a=lin(vC);spec=.5;}
  else if(mat==15){a=lin(vC);emi+=LAMPC*(.15+uNight*7.);}
  else if(mat==16){
    vec2 q=vec2(t.x+t.y,t.x-t.y)/.56;vec2 cq=floor(q);float ch=mod(cq.x+cq.y,2.);
    a=mix(lin(vec3(.74,.48,.4)),lin(vec3(.82,.78,.7)),ch)*(.85+.25*vn(t*3.));
    vec2 fq=fract(q);float e=min(min(fq.x,1.-fq.x),min(fq.y,1.-fq.y));hgt=smoothstep(.0,.04+fw,e);spec=.5;bump=.3;
  }
  else if(mat==17){a=vec3(.08,.08,.09);}
  else if(mat==18){ // carved reliefs
    float cell=floor(t.x/.6);vec2 f=vec2(fract(t.x/.6)-.5,t.y);
    float fig=smoothstep(.55,.45,length(vec2(f.x*2.4,(f.y-3.9)*2.))+fbm(vec2(t.x*5.,t.y*5.)+cell)*.5);
    fig=max(fig,smoothstep(.12,.08,abs(f.x+.15*sin(t.y*4.+cell)))*step(3.25,f.y)*step(f.y,3.9));
    a=lin(vC)*(.6+.4*fig);hgt=fig;bump=1.5;
  }
  // weathering on the old stone and plaster: grime at the base, rain streaks below cornices
  if(mat<=5||mat==18){
    float base=1.-smoothstep(.0,2.2,vP.y);
    float streak=smoothstep(.55,.9,vn(vec2(t.x*1.6,vP.y*.07+t.x*.1)))*.3;
    a*=1.-.35*base-streak*(mat==3?.6:.4);
  }

  vec3 Nn=normalize(vN);vec3 V=uCam-vP;float dist=length(V);V/=dist;
  if(dot(Nn,V)<0.)Nn=-Nn;
  // bump mapping from the screen-space slope of the height field
  float hw=hgt*.018*bump*(1.-smoothstep(.015,.06,fw));
  vec3 dpx=dFdx(vP),dpy=dFdy(vP);float hx=dFdx(hw),hy=dFdy(hw);
  vec3 r1=cross(dpy,Nn),r2=cross(Nn,dpx);float det=dot(dpx,r1);
  vec3 N=abs(det)*Nn-sign(det)*(hx*r1+hy*r2);
  N=dot(N,N)>1e-20?normalize(N):Nn;
  if(dot(N,Nn)<.2)N=Nn;

  // sun shadow (3x3 hardware PCF)
  vec4 sp=uShM*vec4(vP+Nn*(uShT.x*450.+dist*.0006)+uSun*uShT.x*300.,1.);sp.xyz=sp.xyz*.5+.5;
  float sh=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sh+=texture(uSh,vec3(sp.xy+vec2(x,y)*uShT,sp.z-.00004));
  sh/=9.;
  if(any(greaterThan(abs(sp.xy-.5),vec2(.5))))sh=1.;
  // ambient occlusion from the blurred building footprints
  vec4 ao4=texture(uAO,(vP.xz+170.)/340.);
  float ao=vM.y*(1.-.6*ao4.r*(1.-smoothstep(.0,3.,vP.y)));
  ao*=clamp(1.-(ao4.g*90.-vP.y)/30.,.45,1.);
  if(abs(Nn.y)<.5)ao*=mix(.7,1.,smoothstep(.0,1.8,vP.y));
  ao*=.8+.2*clamp(hgt*1.3,0.,1.);

  float ndl=max(dot(N,uSun),0.);
  vec3 amb=mix(uGnd,mix(uSky,uHor,.35),.5+.5*N.y);
  vec3 col=a*(uSunC*ndl*sh+amb*ao);
  // bounce light from the sunlit ground and walls
  col+=a*uSunC*.06*max(-N.y*.5+.5,0.)*ao*max(uSun.y,0.);
  // sun highlight and sky reflection on glass and polished stone
  vec3 H=normalize(uSun+V);float fres=pow(1.-max(dot(N,V),0.),5.);
  col+=uSunC*spec*pow(max(dot(N,H),0.),mix(40.,300.,spec))*sh*ndl*.6;
  vec3 R=reflect(-V,N);
  col+=spec*(.04+.5*fres)*mix(uHor,uSky,clamp(R.y*2.,0.,1.))*ao;
  // street lamps
  for(int i=0;i<24;i++){
    if(i>=uNL)break;
    vec3 Lp=uL[i].xyz-vP;float d2=dot(Lp,Lp);vec3 Ld=Lp*inversesqrt(d2);
    float att=uL[i].w*smoothstep(400.,100.,d2)/(.4+d2*.5);
    col+=a*LAMPC*att*(max(dot(N,Ld),0.)*.85+.15);
  }
  // floodlights on the cathedral and the tower at night
  if((mat==3||mat==4||mat==18)&&uNight>0.)col+=a*uNight*vec3(1.,.72,.42)*(.35+.25*max(N.y,0.)+.4*abs(N.x))*exp(-max(vP.y,0.)/45.)*ao*1.6;
  col+=emi;
  // aerial perspective
  vec3 vd=-V;
  float f=1.-exp(-dist*uFog*(.6+.6*exp(-max(vP.y,0.)*.04)));
  vec3 fc=uHor+uSunC*.18*pow(max(dot(vd,uSun),0.),6.)*(1.-uNight);
  col=mix(col,fc,f);
  oC=vec4(col*uExpo,1.);
}`;

const VS_SHADOW = /*glsl*/`#version 300 es
layout(location=0) in vec3 aP; uniform mat4 uVP; void main(){gl_Position=uVP*vec4(aP,1.);}`;
const FS_SHADOW = /*glsl*/`#version 300 es
precision mediump float; out vec4 o; void main(){o=vec4(1);}`;

// full-screen triangle
const VS_FS = /*glsl*/`#version 300 es
out vec2 vU; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vU=p;gl_Position=vec4(p*2.-1.,1.,1.);}`;

const FS_SKY = /*glsl*/`#version 300 es
precision highp float;
in vec2 vU; uniform mat4 uIVP; uniform vec3 uSun,uSunC,uSky,uHor,uGnd,uMoon; uniform float uTime,uNight,uExpo;
out vec4 oC;
${GLSL_COMMON}
void main(){
  vec4 w=uIVP*vec4(vU*2.-1.,1.,1.);vec3 d=normalize(w.xyz/w.w);
  float y=max(d.y,0.);
  vec3 c=mix(uHor,uSky,pow(y,.42));
  float mu=max(dot(d,uSun),0.);
  c+=uSunC*(.07*pow(mu,5.)+.35*pow(mu,48.))*(1.-uNight);
  c+=uSunC*smoothstep(.99955,.9998,mu)*30.*(1.-uNight);
  // clouds on a flat layer high above
  if(d.y>0.){
    vec2 p=d.xz/(d.y+.08)*.9+vec2(uTime*.003,uTime*.0012);
    float n=fbm(p*1.1)+.5*fbm(p*3.3+3.);
    float cov=smoothstep(.72,1.15,n);
    float lit=.6+.4*smoothstep(.6,1.3,fbm(p*1.1+uSun.xz*.08));
    vec3 cc=mix(uHor*.85,uHor*.7+uSunC*.55,lit)+uSunC*.3*pow(mu,6.);
    cc=mix(cc,uHor*.35+vec3(.02,.02,.03),uNight);
    c=mix(c,cc,cov*smoothstep(.0,.12,d.y)*.92);
  }
  // stars and moon
  if(uNight>0.){
    vec3 q=floor(d*320.);float s=h2(q.xy+q.z*17.);
    c+=uNight*step(.9985,s)*vec3(.6,.7,.9)*2.*smoothstep(.0,.2,d.y);
    float mm=dot(d,uMoon);c+=uNight*smoothstep(.9996,.9998,mm)*vec3(1.,.97,.9)*6.;
    c+=uNight*vec3(.05,.07,.12)*pow(max(mm,0.),30.);
  }
  if(d.y<0.)c=mix(uHor,uGnd*.6,smoothstep(.0,-.25,d.y));
  oC=vec4(c*uExpo,1.);
}`;

// bloom: bright-pass + downsample, then upsample with a tent filter
const FS_DOWN = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec2 uPx; uniform float uThr; out vec4 o;
void main(){vec3 c=texture(uT,vU+uPx*vec2(-1,-1)).rgb+texture(uT,vU+uPx*vec2(1,-1)).rgb+texture(uT,vU+uPx*vec2(-1,1)).rgb+texture(uT,vU+uPx*vec2(1,1)).rgb;
c*=.25;if(uThr>0.){float l=max(max(c.r,c.g),c.b);c*=max(l-uThr,0.)/max(l,1e-4);}o=vec4(min(c,vec3(60.)),1);}`;
const FS_UP = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec2 uPx; out vec4 o;
void main(){vec3 c=vec3(0);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)c+=texture(uT,vU+uPx*vec2(x,y)).rgb*(x==0?2.:1.)*(y==0?2.:1.);o=vec4(c/16.,1);}`;
const FS_COMP = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT,uB; uniform float uBloom,uTime,uScale; out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec3 c=texture(uT,vU).rgb*uScale+texture(uB,vU).rgb*uScale*uBloom;
  c=aces(c*1.05);
  // warm lift in the shadows, slightly cool highlights: a gentle filmic grade
  c=pow(c,vec3(1./2.2));
  c=mix(c,c*vec3(1.03,1.,.95),.6);
  vec2 q=vU-.5;c*=1.-.35*dot(q,q)*1.6;
  c+=(fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
  o=vec4(c,1);
}`;
