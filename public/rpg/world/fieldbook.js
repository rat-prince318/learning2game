// Original dispatch-school pocket notes. Each four adjacent notes form one volume.
const notes = [
  [
    '栈',
    '最后压入的物品最先弹出，所有操作都在栈顶进行。',
    'Stack',
    'The latest item placed on the top is the first item removed.',
  ],
  [
    '队列',
    '物品从队尾加入，按到达先后从队首离开。',
    'Queue',
    'Items enter at the rear and leave from the front in arrival order.',
  ],
  [
    '数组',
    '按下标访问顺序存储的一组元素。',
    'Array',
    'A sequence of stored elements accessed by index.',
  ],
  [
    '链表',
    '每个节点保存数据和指向下一节点的引用。',
    'Linked list',
    'Each node carries data and a reference to the next node.',
  ],
  [
    '平均值',
    '把所有观测值的总和除以观测个数。',
    'Mean',
    'Add the observations and divide by their count.',
  ],
  [
    '中位数',
    '排序后取中央值，偶数个观测时取中央两数的平均值。',
    'Median',
    'Sort the observations and select the middle value or the mean of the middle pair.',
  ],
  [
    '极差',
    '观测到的最大值与最小值的差。',
    'Range',
    'Subtract the smallest observation from the largest one.',
  ],
  [
    '众数',
    '在一组记录中出现次数最多的取值。',
    'Mode',
    'A value occurring with the greatest frequency among the observations.',
  ],
  [
    '串联',
    '元件依次接入同一条电流路径。',
    'Series circuit',
    'Components share a single path for current.',
  ],
  [
    '并联',
    '各支路的两端接到同一对节点上。',
    'Parallel circuit',
    'Each branch connects across the same pair of nodes.',
  ],
  ['功率', '单位时间内转移的能量。', 'Power', 'The rate at which energy is transferred.'],
  [
    '电阻',
    '导体两端电压与通过电流的比值。',
    'Resistance',
    'The potential difference across a conductor divided by the current through it.',
  ],
  [
    '向量',
    '同时用大小和方向描述的量。',
    'Vector',
    'A quantity specified by both magnitude and direction.',
  ],
  [
    '标量',
    '用单个数值和相应单位描述的物理量。',
    'Scalar',
    'A physical quantity described by a numerical value and its unit.',
  ],
  [
    '位移',
    '从初始位置指向最终位置的向量。',
    'Displacement',
    'The vector from an initial position to a final position.',
  ],
  [
    '路程',
    '沿实际轨迹累积的总长度。',
    'Distance traveled',
    'The total length accumulated along the actual path.',
  ],
  [
    '主键',
    '关系表中选来唯一标识一行记录的一列或列组。',
    'Primary key',
    'A column or group of columns chosen to uniquely identify a row.',
  ],
  [
    '外键',
    '表中引用目标表候选键的一组列。',
    'Foreign key',
    'A set of columns referencing a candidate key in a target table.',
  ],
  [
    '索引',
    '通过额外维护的查找结构加快数据检索。',
    'Index',
    'An additional lookup structure that accelerates data retrieval.',
  ],
  [
    '事务',
    '作为一个逻辑工作单元提交或回滚的一组数据库操作。',
    'Transaction',
    'Database operations committed or rolled back as one logical unit.',
  ],
  [
    '广度优先搜索',
    '使用队列按到起点的边数逐层探索无权图。',
    'Breadth-first search',
    'Uses a queue to explore an unweighted graph one distance layer at a time.',
  ],
  [
    '深度优先搜索',
    '沿一条路径深入，处理完相邻顶点后再回溯。',
    'Depth-first search',
    'Follows one path deeply and backtracks after neighboring vertices are processed.',
  ],
  [
    '顶点',
    '图中表示一个地点或对象的节点。',
    'Vertex',
    'A node representing a location or object in a graph.',
  ],
  [
    '边权',
    '赋给图中一条边的数值，可表示通行成本。',
    'Edge weight',
    'A numerical value on a connection that can represent traversal cost.',
  ],
  ['周期', '完成一次完整振动所需的时间。', 'Period', 'The time needed for one complete oscillation.'],
  [
    '频率',
    '每单位时间完成的完整振动次数。',
    'Frequency',
    'The number of complete oscillations per unit time.',
  ],
  [
    '振幅',
    '振动过程中偏离平衡位置的最大距离。',
    'Amplitude',
    'The maximum displacement from equilibrium during an oscillation.',
  ],
  [
    '波长',
    '同一时刻相邻两个同相位点之间沿传播方向的距离。',
    'Wavelength',
    'The separation along propagation between consecutive points in the same phase.',
  ],
  [
    '自转',
    '物体围绕通过自身的轴旋转。',
    'Spin',
    'Rotation of a body about an axis passing through itself.',
  ],
  [
    '公转',
    '天体沿轨道绕另一天体或共同质心运动。',
    'Orbital motion',
    'Motion of a body along an orbit about another body or a common center of mass.',
  ],
  [
    '光年',
    '光在真空中一个儒略年所传播的距离。',
    'Light-year',
    'The distance light travels through a vacuum in one Julian year.',
  ],
  [
    '角速度',
    '角位移随时间的瞬时变化率。',
    'Angular velocity',
    'The instantaneous rate of change of angular displacement.',
  ],
];
export function fieldbook(locale) {
  const offset = locale === 'en' ? 2 : 0;
  return new File(
    [notes.map((row) => row[offset] + '：' + row[offset + 1]).join('\n')],
    'lantern-fieldbook-' + locale + '.txt',
    { type: 'text/plain' },
  );
}
