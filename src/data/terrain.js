// 地形の名前（台地・低地・谷）。位置はラベルを置くおおよその地点
// type: region(広域) plateau(台地) lowland(低地) valley(川・谷)
// minZoom: このズーム以上で表示

export const TERRAIN_LABELS = [
  { name: '武蔵野台地', type: 'region', lng: 139.600, lat: 35.712, minZoom: 9, maxZoom: 12.5 },
  { name: '東京低地', type: 'region', lng: 139.830, lat: 35.720, minZoom: 9, maxZoom: 13 },
  { name: '多摩川低地', type: 'lowland', lng: 139.700, lat: 35.565, minZoom: 10.5 },

  { name: '上野台', type: 'plateau', lng: 139.7705, lat: 35.7255, minZoom: 12 },
  { name: '本郷台', type: 'plateau', lng: 139.7555, lat: 35.7150, minZoom: 12 },
  { name: '白山台', type: 'plateau', lng: 139.7480, lat: 35.7245, minZoom: 13 },
  { name: '小日向台', type: 'plateau', lng: 139.7350, lat: 35.7145, minZoom: 13 },
  { name: '目白台', type: 'plateau', lng: 139.7190, lat: 35.7165, minZoom: 13 },
  { name: '豊島台', type: 'plateau', lng: 139.7050, lat: 35.7330, minZoom: 11.5 },
  { name: '淀橋台', type: 'plateau', lng: 139.7050, lat: 35.6820, minZoom: 11.5 },
  { name: '麹町台', type: 'plateau', lng: 139.7385, lat: 35.6855, minZoom: 13 },
  { name: '白金台', type: 'plateau', lng: 139.7255, lat: 35.6385, minZoom: 13 },
  { name: '目黒台', type: 'plateau', lng: 139.6880, lat: 35.6250, minZoom: 11.5 },
  { name: '荏原台', type: 'plateau', lng: 139.6780, lat: 35.6040, minZoom: 11.5 },
  { name: '田園調布台', type: 'plateau', lng: 139.6640, lat: 35.5880, minZoom: 12 },
  { name: '赤羽台', type: 'plateau', lng: 139.7220, lat: 35.7800, minZoom: 12 },

  { name: '隅田川', type: 'valley', lng: 139.8010, lat: 35.7060, minZoom: 11 },
  { name: '神田川', type: 'valley', lng: 139.7240, lat: 35.7085, minZoom: 12 },
  { name: '渋谷川', type: 'valley', lng: 139.7090, lat: 35.6545, minZoom: 12.5 },
  { name: '宇田川', type: 'valley', lng: 139.6955, lat: 35.6650, minZoom: 13 },
  { name: '古川', type: 'valley', lng: 139.7350, lat: 35.6500, minZoom: 13 },
  { name: '目黒川', type: 'valley', lng: 139.7010, lat: 35.6410, minZoom: 12 },
  { name: '谷田川（藍染川）', type: 'valley', lng: 139.7650, lat: 35.7265, minZoom: 13.5 },
  { name: '小石川（千川）', type: 'valley', lng: 139.7425, lat: 35.7140, minZoom: 13.5 },
  { name: '弦巻川', type: 'valley', lng: 139.7262, lat: 35.7215, minZoom: 13.5 },
  { name: '石神井川', type: 'valley', lng: 139.7300, lat: 35.7500, minZoom: 12 },
  { name: '桃園川', type: 'valley', lng: 139.6600, lat: 35.6990, minZoom: 13 },
  { name: '呑川', type: 'valley', lng: 139.6830, lat: 35.5990, minZoom: 12.5 },
  { name: '立会川', type: 'valley', lng: 139.7180, lat: 35.6060, minZoom: 13 },
  { name: '多摩川', type: 'valley', lng: 139.6500, lat: 35.5900, minZoom: 11 },
];
