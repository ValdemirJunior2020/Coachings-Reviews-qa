'use client';

import {useEffect,useState} from 'react';

type Weather={
  location:string;
  temperature:number;
  condition:string;
  code:number;
  isDay:boolean;
  updatedAt:string;
  source:string;
};

function isRain(code:number){return [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code)}
function isStorm(code:number){return [95,96,99].includes(code)}
function isCloudy(code:number){return [1,2,3,45,48].includes(code)}

export default function WeatherCard(){
  const [weather,setWeather]=useState<Weather|null>(null);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        const res=await fetch('/api/weather',{cache:'no-store'});
        const d=await res.json();
        if(!res.ok)throw new Error(d.error||'Weather unavailable');
        if(cancelled)return;
        setWeather(d);
        localStorage.setItem('qa-weather-west-palm',JSON.stringify(d));
      }catch{
        try{
          const cached=localStorage.getItem('qa-weather-west-palm');
          if(cached&&!cancelled)setWeather(JSON.parse(cached));
        }catch{}
      }
    };
    load();
    const timer=window.setInterval(load,600000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[]);

  const code=weather?.code??2;
  const rain=isRain(code);
  const storm=isStorm(code);
  const cloudy=isCloudy(code);
  const mode=storm?'storm':rain?'rain':cloudy?'cloud':'sunny';

  return <div className={`weather-card weather-mode-${mode}`}>
    <div className="weather-bg" aria-hidden="true">
      {mode==='sunny'&&<div className="weather-sun"><span/><span/><span/><span/><span/><span/><span/><span/></div>}
      {(mode==='cloud'||mode==='rain'||mode==='storm')&&<>
        <div className="weather-cloud-shape weather-cloud-a"/>
        <div className="weather-cloud-shape weather-cloud-b"/>
      </>}
      {(mode==='rain'||mode==='storm')&&<div className="weather-rain-layer">{Array.from({length:18}).map((_,i)=><i key={i} style={{left:`${(i*17)%100}%`,animationDelay:`${(i%6)*-.18}s`,animationDuration:`${.75+(i%5)*.08}s`}}/>)}</div>}
      {mode==='storm'&&<div className="weather-lightning">⚡</div>}
    </div>
    <div className="weather-content">
      <div className="weather-location">West Palm Beach</div>
      <div className="weather-temp">{weather?`${weather.temperature}°F`:'--°F'}</div>
      <div className="weather-condition">{weather?.condition||'Loading weather...'}</div>
      <div className="weather-live">● Live weather</div>
    </div>
  </div>
}
