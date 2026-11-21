/**
 * Быстрая проверка генератора мира: ловит падения вида
 * «Препятствие на дороге» до запуска игры и деплоя.
 * Запуск: npm run check:world
 */
import { generateLayout } from '../src/game/worldgen';

try {
  const L = generateLayout();
  const trees = L.props.filter((p) => p.t === 'tree' || p.t === 'pine' || p.t === 'bush').length;
  const solid = L.colliders.filter((c) => c.tag !== 'curb' && c.y1 > 0.5).length;
  console.log(`✓ мир собран: кварталов ${L.blocks.length}, зданий ${L.buildings.length}, деревьев/кустов ${trees}, твёрдых объектов ${solid}`);
  const fish = L.buildings.filter((b) => b.kind === 'fishshop').length;
  const toilets = L.props.filter((p) => p.t === 'toilet').length;
  console.log(`  рыболовных магазинов ${fish}, пляжных туалетов ${toilets}`);
  // второй областной мини-город с небоскрёбами и деревня с фермой рядом
  const sosn = L.buildings.filter((b) => b.x > 1000 && b.x < 1420 && b.z > 1520 && b.z < 1800);
  const sosnFarm = sosn.filter((b) => b.kind === 'barn' || b.kind === 'coop' || b.kind === 'livestock' || b.kind === 'farm').length;
  const crops = L.props.filter((p) => p.t === 'crop').length;
  const fences = L.props.filter((p) => p.t === 'fence').length;
  const houses = L.buildings.filter((b) => b.kind === 'house' || b.kind === 'vhouse');
  const fenced = houses.filter((b) => b.fenced).length;
  const driveways = L.props.filter((p) => p.t === 'driveway').length;
  console.log(`  Ольховка: ${sosn.length} построек, ферма ${sosnFarm}, грядок ${crops}`);
  console.log(`  деревни (${L.villages.length}): ${L.villages.map((v) => v.name).join(', ')}`);
  console.log(`  дома: ${houses.length}, с забором ${fenced}, подъездов к улице ${driveways}, заборов ${fences}`);
  if (fish < 2 || toilets < 3) throw new Error('пляж собран не полностью');
  if (sosnFarm < 3 || sosn.length < 8) throw new Error('деревня с фермой собрана не полностью');
  if (L.villages.length !== 4) throw new Error('должно быть четыре поселения');
  const eg = L.buildings.filter(b => b.village === 'Егоровка');
  if (eg.filter(b => b.kind === 'vhouse' && b.price === 250000 && b.forSale).length !== 16) throw new Error('неверные дома Егоровки');
  for (const kind of ['supermarket', 'pharmacy', 'gunshop', 'bank']) if (!eg.some(b => b.kind === kind && b.enter)) throw new Error('в Егоровке нет сервиса ' + kind);
  for (const [x, z] of [[566, -284], [790, 1868], [1062, 1608]])
    if (L.pools.some(p => Math.abs(p.x - x) < 1 && Math.abs(p.z - z) < 1)) throw new Error('в деревне остался бассейн');
  for (const v of L.villages) {
    const bath = L.buildings.find(b => b.kind === 'banya' && b.village === v.name && b.enter);
    if (!bath) throw new Error('нет доступной бани: ' + v.name);
    if (L.colliders.some(c => c.tag !== 'b' + bath.id && c.y1 > 0.5 && bath.door.x > c.x0 - 0.35 && bath.door.x < c.x1 + 0.35 && bath.door.z > c.z0 - 0.35 && bath.door.z < c.z1 + 0.35)) throw new Error('вход в баню заблокирован: ' + v.name);
  }
  for (const home of L.buildings.filter(b => b.kind === 'vhouse')) {
    const baths = L.buildings.filter(b => b.kind === 'banya' && b.bathOwner === home.id);
    if (baths.length !== 1) throw new Error(`у дома ${home.id} должно быть по одной бане`);
    const b = baths[0];
    if (b.w > 4 || b.d > 4 || Math.hypot(b.x - home.x, b.z - home.z) > 25) throw new Error('баня вне участка или слишком большая: ' + home.id);
    if (L.colliders.some(c => c.tag !== 'b' + b.id && c.y1 > 0.5 && b.door.x > c.x0 - 0.35 && b.door.x < c.x1 + 0.35 && b.door.z > c.z0 - 0.35 && b.door.z < c.z1 + 0.35)) throw new Error('заблокирован вход бани у дома ' + home.id);
    if (L.buildings.some(o => o.id !== b.id && Math.abs(o.x - b.x) < (o.w + b.w) / 2 && Math.abs(o.z - b.z) < (o.d + b.d) / 2)) throw new Error('баня пересекает постройку у дома ' + home.id);
  }
  const edgeAt = (ax: number, az: number, bx: number, bz: number) => L.edges.some(e => {
    const a = L.nodes[e.a], b = L.nodes[e.b];
    return (a.x === ax && a.z === az && b.x === bx && b.z === bz) || (b.x === ax && b.z === az && a.x === bx && a.z === bz);
  });
  if (!edgeAt(540, -340, 560, -302)) throw new Error('концы улиц Сосновки не соединены');
  if (!edgeAt(610, -290, 660, -290)) throw new Error('нет дороги Сосновка — Егоровка');
  if (edgeAt(780, -350, 780, -290)) throw new Error('посередине Егоровки осталась дорога');
  if (!L.buildings.some(b => b.kind === 'vshop' && b.village === 'Ольховка' && b.w >= 20)) throw new Error('нет большого сельмага Ольховки');
  if (!L.props.some(p => p.t === 'fountain' && p.x > 680 && p.x < 880 && p.z < -290 && p.z > -350)) throw new Error('нет фонтана Егоровки');
  const start = L.nodes.find(n => n.x === 560 && n.z === -302)!;
  const finish = L.nodes.find(n => n.x === 680 && n.z === -290)!;
  const visited = new Set([start.id]), queue = [start.id];
  while (queue.length) for (const e of L.adj[queue.shift()!] || []) if (!visited.has(e.n)) { visited.add(e.n); queue.push(e.n); }
  if (!visited.has(finish.id)) throw new Error('Егоровка не соединена с Сосновкой');
  if (new Set(L.buildings.map(b => b.id)).size !== L.buildings.length || L.buildings.some((b, i) => b.id !== i)) throw new Error('неуникальные ID зданий');
  if (L.garages.length < 34 || new Set(L.garages.map(g => g.id)).size !== L.garages.length) throw new Error('недостаточно гаражей или повторяются ID');
  if (!L.villages.some(v => v.name === 'Сосновка' && v.sz === -340 && v.ez === -340)) throw new Error('Сосновка не отодвинута от города');
  if (L.buildings.filter(b => b.kind === 'vhouse' && b.village === 'Сосновка').length < 22) throw new Error('нет новых домов Сосновки');
  if (L.props.some(p => ['bench', 'path', 'towel'].includes(p.t) && p.x >= 544 && p.x <= 590 && p.z >= -340 && p.z <= -303)) throw new Error('декорации мешают новой дороге');
  const klen = L.nodes.find(n => n.x === 820 && n.z === 1830)!;
  const olh = L.nodes.find(n => n.x === 994 && n.z === 1560)!;
  const reached = new Set([klen.id]), q = [klen.id];
  while (q.length) for (const e of L.adj[q.shift()!] || []) if (!reached.has(e.n)) { reached.add(e.n); q.push(e.n); }
  if (!reached.has(olh.id)) throw new Error('Кленовка не соединена с Ольховкой');
  if (L.parkRides.length) throw new Error('в парке остались аттракционы');
  for (const gone of ['Берёзово', 'Тихая Гавань', 'Лесной Край', 'Дубрава']) if (L.villages.some((v) => v.name === gone)) throw new Error('деревня ' + gone + ' не удалена');
  if (L.newCity || L.bridges.length) throw new Error('соседний город и мост должны быть убраны');
  if (fenced < houses.length) throw new Error('не у каждого дома есть забор');
  if (driveways < houses.length * 0.9) throw new Error('к домам не проложены подъезды');
  // частные кварталы основного города: одна усадьба на весь квартал — огромный двор 42 × 42 м
  const privateBlocks = L.blocks.filter((b) => b.type === 'private' && b.ox === undefined);
  let badBlocks = 0, minYard = 1e9;
  for (const b of privateBlocks) {
    const x0 = b.i * 60 + 6, z0 = b.j * 60 + 6;
    const hs = L.buildings.filter((x) => x.kind === 'house' && x.x > x0 && x.x < x0 + 48 && x.z > z0 && x.z < z0 + 48);
    if (hs.length !== 1) badBlocks++;
    for (const h of hs) minYard = Math.min(minYard, (x0 + 48 - x0) * 48 * 0 + h.w * 4);
  }
  const garageYards = L.buildings.filter((x) => x.kind === 'garage' && x.w > 8).length;
  const pools = L.props.filter((p) => p.t === 'pool').length;
  const greenhouses = L.buildings.filter((b) => b.kind === 'greenhouse').length + L.props.filter((p) => p.t === 'greenhouse').length;
  console.log(`  частные кварталы: ${privateBlocks.length}, усадеб ${privateBlocks.length - badBlocks}, двор ${42 * 42} м², гаражей ${garageYards}, бассейнов ${pools}, теплиц ${greenhouses}`);
  console.log(`  водоёмы для плавания: ${L.pools.length}, садовых дорожек: ${L.props.filter((p) => p.t === 'path').length}, колодцев: ${L.props.filter((p) => p.t === 'well').length}`);
  if (badBlocks) throw new Error(`в ${badBlocks} частных кварталах не одна усадьба`);
  if (pools < privateBlocks.length * 0.9) throw new Error('у усадеб нет бассейнов');
  if (greenhouses < privateBlocks.length * 0.9) throw new Error('у усадеб нет теплиц');
  if (garageYards < privateBlocks.length * 0.9) throw new Error('у усадеб нет больших гаражей');
  void minYard;
  // сёла: застройка выросла — много домов у каждого села
  const villageHouses = L.buildings.filter((b) => b.kind === 'vhouse');
  console.log(`  дома в сёлах: ${villageHouses.length}`);
  if (villageHouses.length < 30) throw new Error('сёла слишком маленькие');
  for (const v of L.villages) {
    const cnt = villageHouses.filter((h) => h.village === v.name).length;
    console.log(`   ${v.name}: ${cnt} домов, улица ${Math.round(Math.hypot(v.ex - v.sx, v.ez - v.sz))} м + ответвления`);
    if (cnt < 8) throw new Error(`село ${v.name} слишком маленькое`);
  }
  // автобусная сеть: 3 маршрута, остановки на тротуарах
  console.log(`  автобус: маршрутов ${L.busRoutes.length}, остановок ${L.busStops.length}, автопарк (${Math.round(L.busDepot.x)}, ${Math.round(L.busDepot.z)})`);
  if (L.busRoutes.length !== 3) throw new Error('должно быть три автобусных маршрута');
  const stopsProps = L.props.filter((p) => p.t === 'busstop').length;
  if (stopsProps !== L.busStops.length) throw new Error('остановки нарисованы не все');
  // городские услуги: мойка, шиномонтаж, паркомат, автомат, ломбард, доставка, садок, стоянка, запчасти, зарядка
  const svc = ['washbay', 'tirestack', 'parkmeter', 'slot', 'pawnshop', 'foodbox', 'fishkeeper', 'impound', 'partsshop', 'evcharger'] as const;
  const svcCount = Object.fromEntries(svc.map((t) => [t, L.props.filter((p) => p.t === t).length]));
  console.log(`  услуги: ${svc.map((t) => `${t} ${svcCount[t]}`).join(', ')}`);
  for (const t of ['washbay', 'tirestack', 'slot', 'pawnshop', 'foodbox', 'fishkeeper', 'partsshop', 'evcharger'] as const)
    if (svcCount[t] < 2) throw new Error(`услуга ${t} не расставлена (${svcCount[t]})`);
  if (!svcCount.parkmeter || !svcCount.impound) throw new Error('паркоматы или штрафстоянка не расставлены');
  // пляж: песок полосами, настил и новые пропы
  const bp = (t: string) => L.props.filter((p) => p.t === t).length;
  const beachProps = { dune: bp('dune'), cabin: bp('cabin'), jetty: bp('jetty'), pave: bp('pave'),
    sunbed: bp('sunbed'), umbrella: bp('umbrella'), boat: bp('boat'), buoy: bp('buoy'),
    ring: bp('ring'), flagline: bp('flagline'), dunegrass: bp('dunegrass'), shell: bp('shell'), ball: bp('ball') };
  console.log(`  пляж: дюны ${beachProps.dune}, кабинки ${beachProps.cabin}, настил-сходы ${beachProps.jetty}, плиты променада ${beachProps.pave}`);
  console.log(`  пляж: зонты ${beachProps.umbrella}, лежаки ${beachProps.sunbed}, лодки ${beachProps.boat}, буйки ${beachProps.buoy}, ` +
    `круги ${beachProps.ring}, гирлянды ${beachProps.flagline}, дюнная трава ${beachProps.dunegrass}, ракушки ${beachProps.shell}, мячи ${beachProps.ball}`);
  if (beachProps.dune < 6 || beachProps.cabin < 2) throw new Error('пляж собран не полностью');
  // настоящий пляж: зонты, лежаки, лодки у воды, буйки, спасательные круги и гирлянды
  if (beachProps.sunbed < 20 || beachProps.umbrella < 20) throw new Error('на пляже мало зонтов и лежаков');
  if (beachProps.boat < 2) throw new Error('у лодочной станции нет лодок');
  if (beachProps.buoy < 5) throw new Error('в воде нет линии буйков');
  if (beachProps.ring < 3) throw new Error('на пляже нет спасательных кругов');
  if (beachProps.flagline < 4) throw new Error('на пляже нет гирлянд флажков');
  if (beachProps.dunegrass < 10) throw new Error('дюны без травы');
  const flag = L.props.find((p) => p.t === 'flag');
  const tops = L.buildings.filter((b) => b.kind !== 'factory' && b.kind !== 'warehouse').sort((a, b) => b.h - a.h);
  if (!flag || !tops.length || flag.h < tops[0].h) throw new Error('пасхалка-флаг не на самом высоком доме');
  console.log(`  пасхалка: флаг на «${tops[0].name}» (${tops[0].h.toFixed(0)} м, квартал ${Math.round(tops[0].x)},${Math.round(tops[0].z)})`);
  if (L.busStops.length < 15) throw new Error('слишком мало автобусных остановок');
  // дороги: не должно быть двух полотен на одной линии (мерцание «две дороги на одной»)
  {
    const seen = new Set<string>(); let dup = 0;
    for (const e of L.edges) {
      const A = L.nodes[e.a], B = L.nodes[e.b];
      const k1 = `${Math.round(A.x)},${Math.round(A.z)}`, k2 = `${Math.round(B.x)},${Math.round(B.z)}`;
      const key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      if (seen.has(key)) dup++; else seen.add(key);
    }
    console.log(`  дороги: рёбер ${L.edges.length}, дублей на одной линии ${dup}`);
    if (dup) throw new Error(`на одной линии ${dup} дублирующихся дорог`);
  }
  // самокаты: стойки в городе и у магазина «Вжух Store»
  const shop = L.buildings.filter((b) => b.kind === 'scootershop');
  const nearShop = L.scooterDocks.filter((d) => shop.some((b) => Math.hypot(d.x - b.door.x, d.z - b.door.z) < 12));
  console.log(`  электросамокаты: стоек ${L.scooterDocks.length} (у «Вжух Store» ${nearShop.length})`);
  if (L.scooterDocks.length < 8) throw new Error('мало станций электросамокатов');
  if (nearShop.length < 1) throw new Error('у магазина самокатов нет стоек аренды');
  // самокаты в деревнях: у каждой деревни своя стойка
  const noDockVillage = L.villages.filter((v) => {
    const cx = (v.sx + v.ex) / 2, cz = (v.sz + v.ez) / 2;
    return !L.scooterDocks.some((d) => Math.hypot(d.x - cx, d.z - cz) < 170);
  });
  console.log(`  самокаты в деревнях: ${L.villages.length - noDockVillage.length} из ${L.villages.length}`);
  if (noDockVillage.length) throw new Error('в деревне нет стойки самокатов: ' + noDockVillage.map((v) => v.name).join(', '));
  // казино: одно за городом, одно в городе — у каждого свой вход
  const casinos = L.buildings.filter((b) => b.kind === 'casino');
  const inCity = casinos.filter((b) => b.x > 0 && b.x < 1080 && b.z > 0 && b.z < 1080);
  console.log(`  казино: ${casinos.length} (в городе ${inCity.length}): ${casinos.map((b) => b.name).join(' · ')}`);
  if (casinos.length < 2) throw new Error('нужно второе казино в городе');
  if (!inCity.length) throw new Error('казино в городе нет');
  // бары: четыре разных заведения
  const bars = L.buildings.filter((b) => b.kind === 'bar');
  const barNames = new Set(bars.map((b) => b.name));
  console.log(`  бары: ${bars.length}, названий ${barNames.size}: ${[...barNames].join(' · ')}`);
  if (bars.length < 4) throw new Error(`баров ${bars.length}, нужно 4`);
  if (barNames.size < 4) throw new Error('у баров одинаковые названия');
  // рекламные щиты: часть в городе, часть за городом, у каждого своя цена часа
  {
    const bb = L.billboards ?? [];
    const city = bb.filter((b) => b.kind === 'city'), road = bb.filter((b) => b.kind === 'road');
    console.log(`  рекламные щиты: ${bb.length} (в городе ${city.length}, за городом ${road.length})`);
    if (!city.length) throw new Error('в городе нет рекламных щитов');
    if (!road.length) throw new Error('за городом нет рекламных щитов');
    if (bb.some((b) => !(b.price > 0))) throw new Error('у щита нет цены аренды');
    // щиты не должны стоять друг на друге и внутри домов
    for (const a of bb) for (const c of bb) {
      if (a === c) continue;
      if (Math.hypot(a.x - c.x, a.z - c.z) < 8) throw new Error(`щиты ${a.id} и ${c.id} налезают друг на друга`);
    }
    const inBuilding = bb.filter((b) => L.buildings.some((bd) =>
      Math.abs(bd.x - b.x) < bd.w / 2 + 1 && Math.abs(bd.z - b.z) < bd.d / 2 + 1));
    if (inBuilding.length) throw new Error(`щиты внутри домов: ${inBuilding.map((b) => b.id).join(', ')}`);
  }
  // парк «Ракета»: 2×2 квартала, без внутренних дорог, с аттракционами, мороженым и прудом
  {
    const bp = L.bigParks.find((q) => q.name === 'Ракета');
    if (!bp) throw new Error('нет парка «Ракета»');
    const side = bp.x1 - bp.x0;
    if (Math.abs(side - (2 * 60 - 12)) > 0.01) throw new Error(`парк не 2×2 квартала: сторона ${side}`);
    const roadsInside = L.edges.filter((e) => {
      const A = L.nodes[e.a], B = L.nodes[e.b];
      const inside = (p: { x: number; z: number }) => p.x > bp.x0 + 1 && p.x < bp.x1 - 1 && p.z > bp.z0 + 1 && p.z < bp.z1 - 1;
      return inside(A) || inside(B);
    });
    if (roadsInside.length) throw new Error(`внутри парка осталось ${roadsInside.length} участков дорог`);
    const inside = (x: number, z: number) => x > bp.x0 && x < bp.x1 && z > bp.z0 && z < bp.z1;
    const kind = (t: string) => L.props.filter((p) => p.t === t && inside(p.x, p.z)).length;
    const rides = L.parkRides.filter((r) => inside(r.x, r.z));
    if (rides.length) throw new Error('в парке остались аттракционы');
    if (kind('rocket') < 1) throw new Error('в парке нет ракеты');
    if (!kind('pond')) throw new Error('в парке нет пруда');
    const ice = L.kiosks.filter((k) => inside(k.x, k.z) && k.type === 2);
    if (!ice.length) throw new Error('в парке нет ларька с мороженым');
    // пруд нельзя обойти: вокруг воды стоит видимая оградка с коллайдерами
    const pond = L.props.find((p) => p.t === 'pond' && inside(p.x, p.z));
    if (pond) {
      const r = pond.h ?? 7.5;
      const ring = L.colliders.filter((c) => {
        const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
        const d = Math.hypot(cx - pond.x, cz - pond.z);
        return d > r * 0.8 && d < r + 2.6 && c.y1 <= 1.2;
      });
      if (ring.length < 12) throw new Error(`вокруг пруда только ${ring.length} ограждений — в воду можно зайти`);
    }
    // невидимых стен в парке быть не должно: любой коллайдер выше 1.2 м должен
    // стоять рядом с видимым объектом (иначе игрок упирается в воздух)
    const solid = L.colliders.filter((c) => {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      return inside(cx, cz) && c.y1 > 1.2;
    });
    let ghosts = 0;
    for (const c of solid) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      const near = L.props.some((p) => Math.hypot(p.x - cx, p.z - cz) < (p.t === 'parkarch' ? 7.6 : 4.5))
        || L.buildings.some((b) => Math.hypot(b.x - cx, b.z - cz) < 30)
        || L.parkRides.some((r) => Math.hypot(r.x - cx, r.z - cz) < 14);
      if (!near) ghosts++;
    }
    console.log(`  парк: коллайдеров выше 1.2 м — ${solid.length}, «стен из воздуха» — ${ghosts}`);
    if (ghosts > 0) throw new Error(`в парке ${ghosts} «стен из воздуха»`);
    // в парке не должно быть светофоров: столбы на входах мешали гулять
    const parkLights = L.nodes.filter((n) => n.light && n.gi !== undefined && n.gj !== undefined
      && n.x > bp.x0 - 1 && n.x < bp.x1 + 1 && n.z > bp.z0 - 1 && n.z < bp.z1 + 1);
    console.log(`  парк: светофоров внутри и по углам — ${parkLights.length}`);
    if (parkLights.length) throw new Error(`в парке остались светофоры: ${parkLights.length}`);
    // кусты: парк должен быть зелёным, но проходимым (у кустов нет коллайдеров)
    const bushes = kind('bush');
    console.log(`  парк: кустов — ${bushes}`);
    if (bushes < 40) throw new Error(`в парке мало кустов: ${bushes}`);
    // куст не должен попасть в пруд или на площадь у ракеты — иначе он «растёт» из воды
    const pondProp = L.props.find((p) => p.t === 'pond' && inside(p.x, p.z));
    const bushList = L.props.filter((p) => p.t === 'bush' && inside(p.x, p.z));
    if (pondProp) {
      const bad = bushList.filter((p) => Math.hypot(p.x - pondProp.x, p.z - pondProp.z) < (pondProp.h ?? 7.5) + 1);
      if (bad.length) throw new Error(`кусты в пруду: ${bad.length}`);
    }
    const nearRocket = bushList.filter((p) => Math.hypot(p.x - (bp.x0 + bp.x1) / 2, p.z - (bp.z0 + bp.z1) / 2) < 17);
    if (nearRocket.length) throw new Error(`кусты на площади у ракеты: ${nearRocket.length}`);
    if (ghosts > 0) throw new Error(`в парке ${ghosts} невидимых стен`);
  }
} catch (e) {
  console.error('✗ генерация мира упала:', (e as Error).message);
  process.exit(1);
}
