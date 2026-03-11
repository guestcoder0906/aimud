import React, { useEffect, useState } from 'react';
import { FileSystem } from '../services/fileSystem';

interface MapPanelProps {
  fileSystem: FileSystem;
  files: string[];
  username: string;
  debugMode: boolean;
}

export default function MapPanel({ fileSystem, files, username, debugMode }: MapPanelProps) {
  const [mapData, setMapData] = useState<any>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  useEffect(() => {
    const content = fileSystem.read('CurrentMap.json');
    if (content) {
      try {
        setMapData(JSON.parse(content));
      } catch (e) {
        console.error("Failed to parse CurrentMap.json");
      }
    } else {
      setMapData(null);
    }
  }, [fileSystem, files]); // Re-run when files change

  let pages: any[] = [];
  if (mapData?.pages && Array.isArray(mapData.pages)) {
    pages = mapData.pages;
  } else if (mapData?.areas) {
    // Backwards compatibility for single-page old format
    pages = [{ name: 'World Map', ...mapData }];
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic p-4 text-center">
        Map data unavailable. The AI engine is generating the world...
      </div>
    );
  }

  const safePageIndex = Math.max(0, Math.min(currentPageIndex, pages.length - 1));
  const currentPage = pages[safePageIndex];

  if (!currentPage || !currentPage.areas) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 italic p-4 text-center">
        Map data unavailable. The AI engine is generating the world...
      </div>
    );
  }

  const parseName = (name: string) => {
    if (!name) return 'Unknown Area';
    let processed = name;

    // Handle target(...)
    processed = processed.replace(/target\((.*?)\)\[(.*?)\]/gs, (match, targets, innerText) => {
      const targetList = targets.split(',').map((t: string) => t.trim());
      if (debugMode || targetList.includes(username)) {
        return innerText;
      }
      return 'Unknown Area';
    });

    // Handle hide[...]
    if (debugMode) {
      processed = processed.replace(/hide\[(.*?)\]/gs, '$1 (Hidden)');
    } else {
      processed = processed.replace(/hide\[.*?\]/gs, 'Unknown Area');
    }

    return processed;
  };

  // Calculate bounds to scale the map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (currentPage.areas && currentPage.areas.length > 0) {
    currentPage.areas.forEach((area: any) => {
      const parsedName = parseName(area.name);
      const isHidden = parsedName === 'Unknown Area' && !debugMode;
      if (isHidden) return; // Skip hidden areas for bounds calculation

      const ax = Number(area.x) || 0;
      const ay = Number(area.y) || 0;
      const aw = Number(area.width) || 10;
      const ah = Number(area.height) || 10;
      const ar = Number(area.radius) || (aw / 2);

      if (area.shape === 'circle') {
        if (ax - ar < minX) minX = ax - ar;
        if (ay - ar < minY) minY = ay - ar;
        if (ax + ar > maxX) maxX = ax + ar;
        if (ay + ar > maxY) maxY = ay + ar;
      } else if (area.shape === 'polygon' && area.points) {
        const pts = area.points.split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
        const numPoints = Math.floor(pts.length / 2);
        for (let j = 0; j < numPoints * 2; j += 2) {
          const px = pts[j];
          const py = pts[j + 1];
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
      } else {
        if (ax < minX) minX = ax;
        if (ay < minY) minY = ay;
        if (ax + aw > maxX) maxX = ax + aw;
        if (ay + ah > maxY) maxY = ay + ah;
      }
    });
  }

  // If no visible areas, set default bounds
  if (minX === Infinity || isNaN(minX) || isNaN(maxX) || isNaN(minY) || isNaN(maxY)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  const mapWidth = Math.max(maxX - minX, 100);
  const mapHeight = Math.max(maxY - minY, 100);

  // Center if we had to expand the width/height
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const finalMinX = cx - mapWidth / 2;
  const finalMinY = cy - mapHeight / 2;

  // Add some padding
  const padding = 20;
  const viewBox = `${finalMinX - padding} ${finalMinY - padding} ${mapWidth + padding * 2} ${mapHeight + padding * 2}`;

  const getAreaColor = (type: string, visible: boolean) => {
    if (visible === false) {
      return 'fill-neutral-900/50 stroke-neutral-800';
    }
    switch (type?.toLowerCase()) {
      case 'field':
      case 'forest':
        return 'fill-green-900/40 stroke-green-700';
      case 'water':
      case 'river':
      case 'lake':
        return 'fill-blue-900/40 stroke-blue-700';
      case 'room':
      case 'dungeon':
        return 'fill-neutral-800/80 stroke-neutral-500';
      case 'hallway':
      case 'corridor':
        return 'fill-neutral-700/60 stroke-neutral-500';
      case 'building':
      case 'wall':
      case 'obstacle':
        return 'fill-neutral-600/80 stroke-neutral-400';
      case 'furniture':
        return 'fill-amber-900/60 stroke-amber-700';
      case 'npc':
        return 'fill-purple-900/60 stroke-purple-700';
      case 'vehicle':
        return 'fill-slate-700/80 stroke-slate-400';
      case 'projectile':
        return 'fill-red-500/80 stroke-red-300';
      default:
        return 'fill-neutral-800/40 stroke-neutral-600';
    }
  };

  const createConePath = (x: number, y: number, facing: number, paramAngle: number, radius: number) => {
    // Treat the angle from the AI as the total span of the vision cone
    let angle = Math.abs(paramAngle) / 2;
    if (angle >= 180) angle = 179.99; // Prevent SVG arc vanishing on perfect circles

    const startAngle = (facing - angle) * Math.PI / 180;
    const endAngle = (facing + angle) * Math.PI / 180;

    const startX = x + radius * Math.cos(startAngle);
    const startY = y + radius * Math.sin(startAngle);

    const endX = x + radius * Math.cos(endAngle);
    const endY = y + radius * Math.sin(endAngle);

    const largeArcFlag = angle * 2 > 180 ? 1 : 0;

    return `M ${x} ${y} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-black relative">
      <div className="absolute top-2 left-2 flex flex-col items-start gap-2 z-10 pointer-events-none">
        <div className="bg-black/80 text-xs text-blue-400 font-mono px-2 py-1 rounded border border-blue-900/50">
          Scale: {currentPage.scale || 'Unknown'}
        </div>

        {pages.length > 1 && (
          <div className="flex gap-1 pointer-events-auto flex-wrap">
            {pages.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPageIndex(idx)}
                className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${idx === safePageIndex
                    ? 'bg-blue-900/50 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                    : 'bg-black/60 border-neutral-800 text-gray-400 hover:bg-neutral-800'
                  }`}
              >
                {p.name || `Page ${idx + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg
        className="w-full h-full"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Draw Areas */}
        {currentPage.areas.map((area: any, i: number) => {
          const parsedName = parseName(area.name);
          const isHidden = parsedName === 'Unknown Area' && !debugMode;

          if (isHidden) return null;

          const ax = Number(area.x) || 0;
          const ay = Number(area.y) || 0;
          const aw = Number(area.width) || 10;
          const ah = Number(area.height) || 10;
          const ar = Number(area.radius) || (aw / 2);

          let textX = ax + aw / 2;
          let textY = ay + ah / 2;
          if (area.shape === 'circle') {
            textX = ax;
            textY = ay;
          } else if (area.shape === 'polygon' && area.points) {
            const pts = area.points.split(/[\s,]+/).map(Number).filter((n: number) => !isNaN(n));
            const numPoints = Math.floor(pts.length / 2);
            if (numPoints >= 1) {
              let sumX = 0, sumY = 0;
              for (let j = 0; j < numPoints * 2; j += 2) {
                sumX += pts[j];
                sumY += pts[j + 1];
              }
              textX = sumX / numPoints;
              textY = sumY / numPoints;
            }
          }

          return (
            <g key={area.id || i} className="group">
              {area.shape === 'circle' ? (
                <circle
                  cx={ax}
                  cy={ay}
                  r={ar}
                  className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                  strokeWidth={2}
                />
              ) : area.shape === 'polygon' && area.points ? (
                <polygon
                  points={area.points}
                  className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                  strokeWidth={2}
                />
              ) : (
                <rect
                  x={ax}
                  y={ay}
                  width={aw}
                  height={ah}
                  className={`${getAreaColor(area.type, area.visible)} transition-colors duration-300 hover:fill-opacity-80 cursor-crosshair`}
                  strokeWidth={2}
                />
              )}
              {/* Tooltip on hover */}
              <title>{parsedName}</title>

              {/* Area Label (only if large enough) */}
              {((area.shape !== 'polygon' && (aw > 20 || ar > 10)) || area.shape === 'polygon') && (
                <text
                  x={textX}
                  y={textY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-gray-400 text-[8px] font-mono pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity"
                >
                  {parsedName}
                </text>
              )}
            </g>
          );
        })}

        {/* Draw Players */}
        {currentPage.players?.map((player: any, i: number) => {
          const px = Number(player.x) || 0;
          const py = Number(player.y) || 0;
          const pfacing = Number(player.facing) || 0;

          return (
            <g key={player.username || i}>
              {/* Vision Cones */}
              {player.vision && (
                <>
                  {/* Max Range (Peripheral) */}
                  <path
                    d={createConePath(px, py, pfacing, Number(player.vision.peripheralAngle) || 90, Number(player.vision.maxRange) || 100)}
                    className="fill-white/5 pointer-events-none"
                  />
                  {/* Detailed Range (Main) */}
                  <path
                    d={createConePath(px, py, pfacing, Number(player.vision.mainAngle) || 66, Number(player.vision.detailedRange) || 50)}
                    className="fill-white/10 pointer-events-none"
                  />
                </>
              )}

              {/* Player Triangle */}
              <polygon
                points="-4,-4 6,0 -4,4"
                fill={player.username === username ? "#3b82f6" : "#ef4444"}
                transform={`translate(${px}, ${py}) rotate(${pfacing})`}
              />
              <text
                x={px}
                y={py - 8}
                textAnchor="middle"
                className="fill-white text-[6px] font-mono pointer-events-none"
              >
                {player.username}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  );
}
