import { NextResponse } from 'next/server';

const URL='https://api.open-meteo.com/v1/forecast?latitude=26.7153&longitude=-80.0534&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=America%2FNew_York';

function condition(code:number){
  if(code===0)return 'Sunny';
  if(code===1)return 'Mostly Sunny';
  if(code===2)return 'Partly Cloudy';
  if(code===3)return 'Cloudy';
  if([45,48].includes(code))return 'Foggy';
  if([51,53,55,56,57].includes(code))return 'Drizzle';
  if([61,63,65,66,67,80,81,82].includes(code))return 'Rain';
  if([71,73,75,77,85,86].includes(code))return 'Snow';
  if([95,96,99].includes(code))return 'Thunderstorm';
  return 'Cloudy';
}

export async function GET(){
  try{
    const res=await fetch(URL,{next:{revalidate:300}});
    if(!res.ok)throw new Error('Weather source unavailable');
    const d=await res.json();
    const c=d.current||{};
    const code=Number(c.weather_code);
    return NextResponse.json({
      location:'West Palm Beach, FL',
      temperature:Math.round(Number(c.temperature_2m)),
      condition:condition(code),
      code,
      isDay:Number(c.is_day)===1,
      updatedAt:new Date().toISOString(),
      source:'Open-Meteo'
    });
  }catch{
    return NextResponse.json({error:'Weather temporarily unavailable.'},{status:503});
  }
}
