'use strict';

/* eslint-disable prettier/prettier */
module.exports = [
  {
    cuts:
      [
        { box: 0, left: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, right: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
        { box: 4, left: { pct: 0.48 } },
      ],
    name: 'Left, 6 Boxes',
  },
  {
    cuts:
      [
        { box: 0, left: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, right: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
        { box: 4, left: { pct: 0.48 } },
        { box: 5, top: { pct: 0.47 } },
      ],
    name: 'Left, 7 Boxes',
  },
  {
    cuts:
      [
        { box: 0, left: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, right: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
      ],
    name: 'Left, 5 Boxes',
  },
  {
    cuts:
      [
        { box: 0, right: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, left: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
        { box: 4, right: { pct: 0.48 } },
      ],
    name: 'Right, 6 Boxes',
  },
  {
    cuts:
      [
        { box: 0, right: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, left: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
        { box: 4, right: { pct: 0.48 } },
        { box: 5, top: { pct: 0.47 } },
      ],
    name: 'Right, 7 Boxes',
  },
  {
    cuts:
      [
        { box: 0, right: { pct: 0.4818 } },
        { box: 1, top: { pct: 0.4891 } },
        { box: 2, left: { pct: 0.4432 } },
        { box: 3, top: { pct: 0.48 } },
      ],
    name: 'Right, 5 Boxes',
  },
  {
    cuts: [
      { box: 0, left: { pct: 0.4818 } },
      { box: 1, top: { pct: 0.4891 } },
      { box: 2, right: { pct: 0.4432 } },
      { box: 3, top: { pct: 0.48 } },
    ],
    name: 'Cover (Left)',
    buffer: 'top',
  },
];
