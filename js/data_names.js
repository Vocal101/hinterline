// Name generators for towns, companies and stations.
(function (root) {
  const HL = root.HL;
  const N = HL.NAMES = {};

  const T_PRE = ['Ash', 'Bram', 'Cal', 'Dun', 'Elm', 'Fen', 'Gar', 'Hale', 'Ivy', 'Kel', 'Lang', 'Mar', 'Nor', 'Oak', 'Pen', 'Quen', 'Rad', 'Stan', 'Thorn', 'Ulver', 'Wen', 'Yar', 'Brack', 'Chal', 'Dray', 'Ever', 'Fair', 'Glen', 'Hark', 'Kings', 'Lid', 'Mill', 'Nether', 'Otter', 'Pyle', 'Rook', 'Sand', 'Tid', 'Upton', 'Wey', 'Bex', 'Cran', 'Dove', 'Fox', 'Gos', 'Hol', 'Kirk', 'Lox', 'Moss', 'Pud', 'Rush', 'Sel', 'Tam', 'Wick', 'Wold', 'Ravens', 'Cold', 'Bur', 'Shep', 'Whit', 'Black', 'Brook', 'Hazel', 'Penny', 'Tarr', 'Bal'];
  const T_SUF = ['ford', 'bury', 'ham', 'ton', 'wick', 'by', 'mouth', 'field', 'stead', 'ley', 'well', 'cote', 'den', 'combe', 'thorpe', 'worth', 'bridge', 'hurst', 'marsh', 'stow', 'ing', 'more', 'gate', 'brook', 'holme', 'hythe', 'minster', 'cliffe', 'haven', 'shaw'];
  const T_PREFIX = ['Upper ', 'Lower ', 'Great ', 'Little ', 'East ', 'West ', 'North ', 'South ', 'Old ', 'New '];
  const T_POST = [' Green', ' Cross', ' End', ' St. Anne', ' Heath', ' Magna', ' Parva', '-on-Sea', ' Vale', ' Common'];

  const A_PRE = ['Kal', 'Sval', 'Tor', 'Vik', 'Hel', 'Fjar', 'Rim', 'Skor', 'Ul', 'Bjar', 'Ost', 'Nord', 'Is', 'Frost', 'Varg', 'Lund', 'Hval', 'Gry', 'Myr', 'Sten', 'Elv', 'Bod', 'Har', 'Trond', 'Aal', 'Kirkje', 'Sol', 'Rau', 'Dals', 'Alv'];
  const A_SUF = ['vik', 'dal', 'heim', 'by', 'stad', 'fjord', 'nes', 'berg', 'holm', 'vang', 'sund', 'lund', 'eid', 'havn', 'set', 'mark', 'voll', 'rud', 'strand', 'haug'];

  const D_PRE = ['Al', 'Sab', 'Qar', 'Zan', 'Mer', 'Ouar', 'Tam', 'Kas', 'Bel', 'Dar', 'Jaz', 'Has', 'Sir', 'Mar', 'Fen', 'Rha', 'Tal', 'Naz', 'Oud', 'Sel', 'Kir', 'Ama', 'Ibr', 'Esh', 'Zer', 'Lou', 'Mal', 'Tib', 'Gha', 'Ayo'];
  const D_SUF = ['ah', 'ara', 'esh', 'oun', 'ira', 'aba', 'it', 'ouz', 'adi', 'ani', 'ar', 'ema', 'udi', 'eh', 'ana', 'ib', 'oma', 'ess', 'aya', 'il'];
  const D_PREFIX = ['Port ', 'Wadi ', 'Oasis ', 'Ras ', 'Bir ', 'Cape '];

  N.town = function (rng, climate, used) {
    for (let tries = 0; tries < 60; tries++) {
      let s;
      if (climate === 'arctic') {
        s = rng.pick(A_PRE) + rng.pick(A_SUF);
        if (rng.chance(0.08)) s = 'Nye ' + s;
      } else if (climate === 'desert') {
        s = rng.pick(D_PRE) + rng.pick(D_SUF);
        if (rng.chance(0.15)) s = rng.pick(D_PREFIX) + s;
        else if (rng.chance(0.12)) s = s + ' ' + rng.pick(['Wells', 'Springs', 'Bay', 'Crossing']);
      } else {
        s = rng.pick(T_PRE) + rng.pick(T_SUF);
        s = s.replace(/(.)\1\1/, '$1$1');
        if (rng.chance(0.12)) s = rng.pick(T_PREFIX) + s;
        else if (rng.chance(0.1)) s = s + rng.pick(T_POST);
      }
      s = s[0].toUpperCase() + s.slice(1);
      if (!used || !used.has(s)) { if (used) used.add(s); return s; }
    }
    return 'Town ' + rng.int(9999);
  };

  const SURN = ['Hargreave', 'Pemberton', 'Ashdown', 'Coltrane', 'Whitlock', 'Mallory', 'Fairweather', 'Brannock', 'Quill', 'Ostrander', 'Tennant', 'Vickery', 'Darrow', 'Ellery', 'Gosling', 'Holloway', 'Kettering', 'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Pratchell', 'Rasmussen', 'Silvani', 'Treadwell', 'Underhill', 'Varga', 'Winslow', 'Yeoman', 'Abernathy', 'Blackwood', 'Castellan', 'Dunmore', 'Featherstone', 'Grimsby', 'Halvorsen'];
  const FORMS = ['{S} & {S2} Transport', '{S} Haulage', '{T} & District Railway', '{S} Brothers Carriers', '{T} Transit Co.', '{S} Freight Lines', 'Great {T} Railway', '{S} Motor Services', '{T} Steam Packet Co.', '{S}, {S2} & Co.', '{T} Consolidated', '{S} Overland'];
  N.company = function (rng, towns) {
    const t = towns && towns.length ? rng.pick(towns).name : 'Hinterland';
    let s1 = rng.pick(SURN), s2 = rng.pick(SURN);
    while (s2 === s1) s2 = rng.pick(SURN);
    return rng.pick(FORMS).replace('{S}', s1).replace('{S2}', s2).replace('{T}', t.replace(/^(Upper|Lower|Great|Little|East|West|North|South|Old|New) /, ''));
  };
  N.manager = function (rng) {
    const F = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.', 'T.', 'W.'];
    return rng.pick(F) + ' ' + rng.pick(SURN);
  };
  N.STATION_SUFFIX = ['', ' Central', ' North', ' South', ' East', ' West', ' Junction', ' Halt', ' Road', ' Market', ' Docks', ' Exchange', ' Parkway', ' Valley', ' Heights', ' Cross', ' Fields', ' Woods', ' Quay', ' Airfield', ' Sidings', ' Mines'];
})(typeof window !== 'undefined' ? window : globalThis);
