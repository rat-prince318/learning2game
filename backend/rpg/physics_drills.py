"""Worked applications of mechanics relations present in verified exam exercises."""

from dataclasses import dataclass
from fractions import Fraction
from hashlib import sha256

from ..models import KnowledgeItem
from .encounter_cards import drill_card
from .models import RPGChallengeInternal


@dataclass(frozen=True)
class Problem:
    zh: str
    en: str
    values: tuple[int | Fraction, int | Fraction, int | Fraction]
    unit: str
    hint: tuple[str, str]
    working: str


def _vectors(topic, a, b):
    """Signed components, inverse operations, and geometric checks."""
    if topic == "add":
        yield Problem(
            f"小车沿东向走了 {a+b} m，再向西退了 {b} m。取东为正，合位移的东向分量是多少？",
            f"A cart rolls {a+b} m east, then {b} m west. Taking east as positive, what is the east component of its displacement?",
            (a, a+2*b, -a), "m", ("先把两段位移写成带符号的分量。", "Write each displacement as a signed component."),
            rf"\Delta x={a+b}-{b}={a}")
        yield Problem(
            f"船相对岸的北向速度分量为 {a+b} m/s，其中水流贡献 {a} m/s 向北。船相对水的北向分量是多少？",
            f"A boat's northward velocity relative to shore is {a+b} m/s, of which the current contributes {a} m/s north. What is its northward component relative to the water?",
            (b, 2*a+b, -b), "m/s", ("从合分量中扣去已知分量。", "Subtract the known component from the total."),
            rf"v_{{2y}}={a+b}-{a}={b}")
        yield Problem(
            f"取向上为正。升降台先下降 {a} m，然后连续两次各上升 {a+b} m。最后相对出发点的竖直位移是多少？",
            f"Take up as positive. A lift drops {a} m, then rises {a+b} m twice. What is its final vertical displacement from the start?",
            (a+2*b, b, 3*a+2*b), "m", ("两次上升都要计入同一轴的分量和。", "Count both upward motions on the same axis."),
            rf"\Delta y=-{a}+2({a+b})={a+2*b}")
        yield Problem(
            f"无人机向东飞 {a} m，再向北飞 {b} m。若要直线飞回出发点，返程位移沿东向的分量是多少？",
            f"A drone flies {a} m east and {b} m north. What eastward component must its return displacement have to bring it back to the start?",
            (-a, a, 0), "m", ("闭合路径的每个分量和都为零。", "Each component sums to zero on a closed path."),
            rf"{a}+x=0,\quad x=-{a}")
    elif topic == "dot":
        yield Problem(
            f"手推车向东移动 {b} m。你同时向东施加 {a} N、向上施加 {a+b} N。这个力做了多少功？",
            f"A cart moves {b} m east. Your force has components {a} N east and {a+b} N up. How much work does it do?",
            (a*b, (a+b)*b, (2*a+b)*b), "J", ("功取力与位移的点积。", "Take the dot product of force and displacement."),
            rf"W={a}({b})+({a+b})(0)={a*b}")
        yield Problem(
            rf"平面向量 \(({a},1)\) 与 \((1,y)\) 垂直。求 \(y\)。",
            rf"The planar vectors \(({a},1)\) and \((1,y)\) are perpendicular. Find \(y\).",
            (-a, a, 0), "", ("垂直的两个向量点积为零。", "Perpendicular vectors have zero dot product."),
            rf"{a}(1)+1(y)=0,\quad y=-{a}")
        yield Problem(
            rf"已知 \(\mathbf u\) 与 \(\mathbf v\) 的点积为 \({a}\)。将 \(\mathbf v\) 反向并放大到原来的 {b} 倍，新点积为多少？",
            rf"The dot product of \(\mathbf u\) and \(\mathbf v\) is \({a}\). Reverse \(\mathbf v\) and scale its magnitude by {b}. What is the new dot product?",
            (-a*b, a*b, a), "", ("向量乘上的标量也会乘到点积上。", "A scalar factor on one vector also multiplies the dot product."),
            rf"\mathbf u\mathbin{{\cdot}}(-{b}\mathbf v)=-{b}({a})={-a*b}")
        yield Problem(
            rf"向量 \(\mathbf d=({a},-{b})\)。求它与自身的点积。",
            rf"A vector is \(\mathbf d=({a},-{b})\). What is its dot product with itself?",
            (a*a+b*b, a*a-b*b, -(a*a+b*b)), "", ("将每个分量平方再相加。", "Square each component and add."),
            rf"|\mathbf d|^2={a}^2+(-{b})^2={a*a+b*b}")
    else:  # cross product, right-handed coordinates throughout
        yield Problem(
            f"在右手坐标系里，点在原点以东 {a} m 的 x 轴上。施加向北（+y）的 {b} N 力。力矩的 z 分量是多少？",
            f"In a right-handed frame a point is {a} m along +x from the origin. A {b} N force acts along +y. What is the z component of torque about the origin?",
            (a*b, -a*b, 0), "N\\,m", ("按位置向量叉乘力的顺序使用右手定则。", "Use the right-hand rule with position crossed into force."),
            rf"\tau_z=r_xF_y-r_yF_x={a}({b})={a*b}")
        yield Problem(
            rf"已知 \(\mathbf a\times\mathbf b\) 的 z 分量是 \({a}\)。交换两个向量的顺序，新叉积的 z 分量是多少？",
            rf"The z component of \(\mathbf a\times\mathbf b\) is \({a}\). Swap the order of the vectors. What is the new z component?",
            (-a, a, 0), "", ("交换叉积的两个因数会改变方向。", "Reversing the order of a cross product reverses its direction."),
            rf"(\mathbf b\times\mathbf a)_z=-{a}")
        yield Problem(
            f"两个向量长度分别为 {a} 和 {b}，夹角为 30°。以它们为邻边的平行四边形面积是多少？",
            f"Two vectors of lengths {a} and {b} enclose a 30° angle. What is the area of the parallelogram they span?",
            (Fraction(a*b,2), a*b, 2*a*b), "", ("面积等于两边叉积的大小。", "The area equals the magnitude of the cross product."),
            rf"A={a}({b})\sin 30^\circ=\frac{{{a*b}}}{{2}}")
        yield Problem(
            f"扳手长 {a} cm。手沿扳手的长轴朝螺母用力，力为 {b} N。绕螺母的力矩大小是多少？",
            f"A wrench is {a} cm long. You push with {b} N along the handle straight toward the nut. What is the torque magnitude about the nut?",
            (0, Fraction(a*b,100), a*b), "N\\,m", ("先找作用线到转轴的垂直距离。", "Find the perpendicular distance from the pivot to the line of action."),
            r"|\tau|=rF\sin 180^\circ=0")


def _flywheel(topic, a, b):
    # All angular velocities below refer to rotation in a fixed positive direction.
    speed, duration, accel = a, 2*b, 2
    final = speed + accel*duration
    if topic == "initial":
        yield Problem(
            f"飞轮以 2 rad/s² 的恒定角加速度加速 {duration} s，末角速度是 {final} rad/s。转速增加了多少 rad/s？",
            f"A flywheel accelerates at 2 rad/s² for {duration} s, finishing at {final} rad/s. By how much did its angular speed increase?",
            (2*duration, duration, final), "rad/s", ("求变化量时只需角加速度和持续时间。", "Use the angular acceleration and the time interval."),
            rf"\Delta\omega=\alpha t=2({duration})={2*duration}")
        yield Problem(
            f"电机沿正方向转动，匀减速 {b} s 后仍沿原方向以 {a} rad/s 转动。减速率为 2 rad/s²。开始减速时的角速度是多少？",
            f"A motor slows uniformly at 2 rad/s² for {b} s. It still turns forward at {a} rad/s. What was its angular speed at the start of braking?",
            (a+2*b, a, a+4*b), "rad/s", ("把减速期间损失的角速度加回去。", "Add back the angular speed lost while braking."),
            rf"\omega_0={a}+2({b})={a+2*b}")
        yield Problem(
            f"飞轮从 {a} rad/s 开始匀加速，{b} s 后达到 {a+3*b} rad/s。角加速度是多少？",
            f"A flywheel speeds up uniformly from {a} to {a+3*b} rad/s in {b} s. Find its angular acceleration.",
            (3, 3*b, 6), "rad/s^2", ("从末角速度中减去初角速度，再除以时间。", "Divide the change in angular velocity by elapsed time."),
            rf"\alpha=({a+3*b}-{a})/{b}=3")
        yield Problem(
            f"电机起动时已有 {a} rad/s 的角速度，之后以 3 rad/s² 匀加速。还需几秒才能达到 {a+3*b} rad/s？",
            f"A motor starts this interval at {a} rad/s and accelerates uniformly at 3 rad/s². How many seconds until it reaches {a+3*b} rad/s?",
            (b, 3*b, b+1), "s", ("用要增加的角速度除以角加速度。", "Divide the required angular speed gain by the angular acceleration."),
            rf"t=({a+3*b}-{a})/3={b}")
    elif topic == "angle":
        yield Problem(
            f"飞轮在 {duration} s 内从 {a} rad/s 匀加速到 {a+2} rad/s。这段时间共转过多少弧度？",
            f"A flywheel accelerates uniformly from {a} to {a+2} rad/s over {duration} s. Through how many radians does it turn?",
            ((a+1)*duration, a*duration, (a+2)*duration), "rad", ("角速度图线下的面积是梯形面积。", "The area under an angular velocity graph is a trapezoid here."),
            rf"\Delta\theta=({a}+{a+2})({duration})/2={(a+1)*duration}")
        yield Problem(
            f"飞轮从静止匀加速，{duration} s 内转过 {a*duration} rad。末角速度是多少？",
            f"A flywheel accelerates uniformly from rest and turns through {a*duration} rad in {duration} s. Find its final angular speed.",
            (2*a, a, 4*a), "rad/s", ("从静止出发时，平均角速度是末角速度的一半。", "Starting from rest, the mean angular speed is half the final speed."),
            rf"\omega_f=2\Delta\theta/t=2({a*duration})/{duration}={2*a}")
        yield Problem(
            f"角速度保持 {a} rad/s 达 {b} s 后又匀减速 {2*b} s 到零。只算减速阶段，转过多少弧度？",
            f"After {b} s at a steady {a} rad/s, a wheel slows uniformly to rest in {2*b} s. How many radians does it sweep during braking alone?",
            (a*b, 2*a*b, 3*a*b), "rad", ("只取减速区间在角速度图下围出的三角形。", "Use only the triangular area under the braking interval."),
            rf"\Delta\theta=\tfrac12({a})({2*b})={a*b}")
        yield Problem(
            f"飞轮从静止以 {2*a} rad/s² 匀加速，经过 {b} s 后累计转过多少弧度？",
            f"A flywheel accelerates uniformly from rest at {2*a} rad/s². What is its angular displacement after {b} s?",
            (a*b*b, 2*a*b*b, 3*a*b*b), "rad", ("从静止开始可用角加速度和时间的平方求位移。", "Use angular acceleration and the square of elapsed time."),
            rf"\Delta\theta=\alpha t^2/2=({2*a})({b})^2/2={a*b*b}")
    else:  # average angular speed
        yield Problem(
            f"飞轮沿同一方向做匀角加速转动，角速度从 {a} rad/s 增至 {a+2*b} rad/s。这一段平均角速度是多少？",
            f"Angular speed increases uniformly from {a} to {a+2*b} rad/s without reversing. Find the mean angular speed.",
            (a+b, a, a+2*b), "rad/s", ("匀角加速时图线是直线。", "For constant angular acceleration the graph is a straight line."),
            rf"\bar\omega=({a}+{a+2*b})/2={a+b}")
        yield Problem(
            f"飞轮保持同一转向，{b} s 内转过 {a*b} rad。传感器应记录多大的平均角速度？",
            f"A flywheel turns in one direction through {a*b} rad in {b} s. What mean angular speed should the sensor report?",
            (a, a*b, 2*a*b), "rad/s", ("平均角速度可由这一段的总转角和时间求出。", "Use the total angular displacement and total time."),
            rf"\bar\omega=\Delta\theta/t={a*b}/{b}={a}")
        yield Problem(
            f"测得飞轮匀加速期间的平均角速度是 {a+b} rad/s，初角速度为 {a} rad/s。末角速度是多少？",
            f"During uniform angular acceleration the mean speed is {a+b} rad/s and the initial speed is {a} rad/s. What is the final angular speed?",
            (a+2*b, a+b, a), "rad/s", ("把首末转速的平均式反解。", "Invert the relation between the mean and endpoint speeds."),
            rf"\omega_f=2\bar\omega-\omega_0=2({a+b})-{a}={a+2*b}")
        yield Problem(
            f"电机先以 {a} rad/s 转 1 s，再以 {a+3*b} rad/s 同向转 2 s。全程平均角速度是多少？",
            f"A motor turns at {a} rad/s for 1 s, then at {a+3*b} rad/s in the same direction for 2 s. What is the mean angular speed over the whole run?",
            (a+2*b, a+b, a+3*b), "rad/s", ("两段持续时间不同，先分别计算转角。", "The intervals have different durations. Add their angular displacements."),
            rf"\bar\omega=[{a}+2({a+3*b})]/3={a+2*b}")


def _pulley(topic, a, b):
    if topic == "rim":
        yield Problem(
            f"绳子以 {a*b} cm/s 的速度从半径 {b} cm 的滑轮上放出，绳与轮缘始终贴合，无滑动。角速度大小是多少？",
            f"A cord unwinds without slipping at {a*b} cm/s from a pulley of radius {b} cm. Find its angular speed.",
            (a, 2*a, a*b), "rad/s", ("取同一套长度单位，再将绳速除以半径。", "Use consistent length units, then divide cord speed by radius."),
            rf"\omega=v/R={a*b}/{b}={a}")
        yield Problem(
            f"半径 {b} cm 的卷筒以 {a} rad/s 转动，绳子紧贴卷筒且无滑动。每秒放出多少厘米的绳？",
            f"A drum of radius {b} cm rotates at {a} rad/s with no slip. How much cord pays out each second, in cm/s?",
            (a*b, 2*a*b, a*b*b), "cm/s", ("用轮缘的切向速度。", "Use the tangential speed of the rim."),
            rf"v=\omega R={a}({b})={a*b}")
        yield Problem(
            f"卷筒直径 {2*b} cm，绳子紧贴轮缘放出 {a*b} cm，过程无滑动。卷筒转过多少弧度？",
            f"A drum of diameter {2*b} cm unwinds {a*b} cm of cord without slipping. Through how many radians does it turn?",
            (a, Fraction(a,2), 2*a), "rad", ("绳长等于轮缘走过的弧长。", "Cord length equals the arc length swept by the rim."),
            rf"\theta=s/R={a*b}/{b}={a}")
        yield Problem(
            f"一条无滑动的皮带带动两个轮。小轮半径 {b} cm、角速度 {2*a} rad/s，大轮半径 {2*b} cm。大轮角速度是多少？",
            f"A belt drives two pulleys without slipping. The small pulley has radius {b} cm and speed {2*a} rad/s. The large radius is {2*b} cm. Find the large pulley’s angular speed.",
            (a, 2*a, 4*a), "rad/s", ("同一条皮带使两个轮缘的线速度相等。", "The common belt sets both rim speeds equal."),
            rf"\omega_L=\omega_s R_s/R_L={2*a}({b})/{2*b}={a}")
    else:
        yield Problem(
            f"质量为 {4*a} kg 的均匀实心圆盘绕中心轴转动，轮缘速度为 {b} m/s。转动动能是多少？",
            f"A uniform solid disk of mass {4*a} kg spins about its central axis. The rim moves at {b} m/s. Find its rotational kinetic energy.",
            (a*b*b, 2*a*b*b, 4*a*b*b), "J", ("把圆盘转动惯量与轮缘速度的关系式代入动能。", "Combine the disk inertia and rim-speed relation with rotational kinetic energy."),
            rf"K=Mv^2/4=({4*a})({b})^2/4={a*b*b}")
        yield Problem(
            f"同一只实心滑轮原有转动动能 {a} J。将轮缘速度加倍后，它的转动动能是多少？",
            f"A solid pulley initially stores {a} J of rotational energy. What is its energy after its rim speed doubles?",
            (4*a, 2*a, a), "J", ("同一滑轮的转动动能与轮缘速度的平方成正比。", "For a given pulley, energy scales with the square of rim speed."),
            rf"K'=2^2 K=4({a})={4*a}")
        yield Problem(
            f"一个均匀实心滑轮绕中心轴转动。其转动动能为 {a*b*b} J，轮缘速度为 {b} m/s。滑轮质量为多少？",
            f"A uniform solid pulley rotates about its central axis. Its rotational energy is {a*b*b} J and its rim speed is {b} m/s. Find the pulley mass.",
            (4*a, 2*a, a), "kg", ("从实心圆盘的轮缘速度动能式中解出质量。", "Solve the energy formula for a solid disk in terms of rim speed for mass."),
            rf"M=4K/v^2=4({a*b*b})/{b}^2={4*a}")
        yield Problem(
            f"两个均匀实心轮的轮缘速度相同。甲轮质量 {a} kg，动能 {b} J；乙轮质量是甲的三倍。乙轮的转动动能为多少？",
            f"Two uniform solid disks have the same rim speed. Disk A has mass {a} kg and rotational energy {b} J. Disk B has three times its mass. Find disk B’s rotational energy.",
            (3*b, b, 9*b), "J", ("固定轮缘速度，考察转动动能如何随质量变化。", "At fixed rim speed, compare how energy depends on disk mass."),
            rf"K_B/K_A=M_B/M_A=3,\quad K_B={3*b}")


def _translation(topic, a, b):
    if topic == "force":
        yield Problem(
            f"一辆 {a} kg 小车受两个水平力，向东 {a*b+b} N，向西 {b} N。它沿东向的加速度是多少？",
            f"A {a} kg cart feels two horizontal forces, {a*b+b} N east and {b} N west. Find its eastward acceleration.",
            (b, 2*b, a*b), "m/s^2", ("沿同一轴合成两个力，再考虑质量。", "Combine the opposing forces along one axis before using the mass."),
            rf"a_x=({a*b+b}-{b})/{a}={b}")
        yield Problem(
            f"对同一物体施加 {a*b} N 合力时，加速度为 {b} m/s²。这个物体的质量是多少？",
            f"A net force of {a*b} N produces an acceleration of {b} m/s². What is the object's mass?",
            (a, a*b, a*b*b), "kg", ("从牛顿第二定律中解出质量。", "Solve Newton's second law for mass."),
            rf"m=F/a={a*b}/{b}={a}")
        yield Problem(
            f"在冰面上，质量 {a} kg 的雪橇原来向东运动。取向东为正，现测得加速度为 −{b} m/s²。合力沿东向的分量是多少？",
            f"A sled of mass {a} kg is moving east. Take east as positive. Its acceleration is now −{b} m/s². Find the eastward component of the net force.",
            (-a*b, a*b, 0), "N", ("力的方向跟随加速度的方向。", "The net force points in the direction of acceleration."),
            rf"F_x=m a_x={a}(-{b})={-a*b}")
        yield Problem(
            f"一辆小车受到恒定合力，加速度为 {2*b} m/s²。把质量加倍，仍施加同样的合力。现在的加速度是多少？",
            f"A constant net force accelerates a cart at {2*b} m/s². Double its mass and keep the net force fixed. What is its new acceleration?",
            (b, 2*b, 4*b), "m/s^2", ("在合力固定时比较加速度与质量的关系。", "Compare acceleration and mass at fixed net force."),
            rf"a'=F/(2m)=({2*b})/2={b}")
    elif topic == "energy":
        yield Problem(
            f"一颗小球的平动动能为 {a} J。在质量相同的条件下，若速率变为原来的三倍，动能是多少？",
            f"A ball has {a} J of translational kinetic energy. Its speed triples at fixed mass. What is its new kinetic energy?",
            (9*a, 3*a, a), "J", ("动能与速率的平方成正比。", "Kinetic energy scales with the square of speed."),
            rf"K'=3^2K=9({a})={9*a}")
        yield Problem(
            f"质量为 {2*a} kg 的小车具有 {a*b*b} J 的平动动能。它的速率是多少？",
            f"A cart of mass {2*a} kg has {a*b*b} J of translational kinetic energy. Find its speed.",
            (b, b*b, 2*b), "m/s", ("先求出速率的平方，再开平方。", "Solve for the square of the speed and take its positive root."),
            rf"v=\sqrt{{2K/m}}=\sqrt{{2({a*b*b})/{2*a}}}={b}")
        yield Problem(
            f"两辆车的速率均为 {b} m/s。质量 {a} kg 的车有动能 K，另一辆质量是它的四倍。后一辆的平动动能是 K 的多少倍？",
            f"Two carts both move at {b} m/s. The {a} kg cart has kinetic energy K. The other cart is four times as massive. What is the ratio of its kinetic energy to K?",
            (4, 2, 16), "", ("把两车的动能相除，约去相同的速率项。", "Take the ratio of the energies and cancel the common speed term."),
            r"K_2/K_1=m_2/m_1=4")
        yield Problem(
            f"质量 {2*a} kg 的物体从 {b} m/s 提速至 {2*b} m/s。它的平动动能增加了多少？",
            f"A {2*a} kg object speeds up from {b} to {2*b} m/s. By how much does its translational kinetic energy increase?",
            (3*a*b*b, a*b*b, 4*a*b*b), "J", ("分别计算前后动能，再作差。", "Calculate the final and initial energies before taking their difference."),
            rf"\Delta K=({2*a}/2)[{2*b}^2-{b}^2]={3*a*b*b}")
    else:  # linear momentum
        yield Problem(
            f"取向右为正。质量 {a} kg 的小车以 {b} m/s 向左运动。它的动量沿右向的分量是多少？",
            f"Take right as positive. A {a} kg cart rolls left at {b} m/s. Find the signed component of its momentum along the rightward axis.",
            (-a*b, a*b, 0), "kg\\,m/s", ("把速度的方向带入动量分量。", "Use the signed velocity component in the momentum formula."),
            rf"p_x=mv_x=({a})(-{b})={-a*b}")
        yield Problem(
            f"物体的动量大小为 {a*b} kg m/s，速率为 {b} m/s。它的质量是多少？",
            f"An object's momentum magnitude is {a*b} kg m/s and its speed is {b} m/s. Find its mass.",
            (a, a*b, a*b*b), "kg", ("将动量大小除以速率。", "Divide the magnitude of momentum by speed."),
            rf"m=p/v={a*b}/{b}={a}")
        yield Problem(
            f"两个小车沿同一条轨道正向行驶。甲的动量为 {a} kg m/s，乙的动量为 {b} kg m/s。两车合计的正向动量是多少？",
            f"Two carts roll forward on the same track with momenta {a} and {b} kg m/s. What is the total forward momentum?",
            (a+b, abs(a-b), a+2*b), "kg\\,m/s", ("两车动量沿同一方向，可直接相加。", "The momenta point the same way, so their forward components add."),
            rf"P_x={a}+{b}={a+b}")
        yield Problem(
            f"质量 {a} kg 的球从向右 {b} m/s 反弹为向左 {b} m/s。取向右为正，球的动量变化量是多少？",
            f"A ball of mass {a} kg rebounds from {b} m/s rightward to {b} m/s leftward. Taking right as positive, what is its signed change in momentum?",
            (-2*a*b, 0, 2*a*b), "kg\\,m/s", ("从末动量中减去初动量，二者方向相反。", "Subtract initial momentum from final momentum, taking the reversal into account."),
            rf"\Delta p_x={a}(-{b}-{b})={-2*a*b}")


# Match the precise topic labels assigned by the checked mechanics adapters.
# A general mention of "energy" in an unrelated course must not activate this bank.
_TOPICS = {
    ("向量的分量加法", "Addition by vector components"): (_vectors, "add"),
    ("向量的点积", "Dot product by components"): (_vectors, "dot"),
    ("右手系中的向量叉积", "Cross product in a right-handed frame"): (_vectors, "cross"),
    ("飞轮的初始角速度", "Initial angular speed of the flywheel"): (_flywheel, "initial"),
    ("匀角加速飞轮的角位移", "Angle swept at constant angular acceleration"): (_flywheel, "angle"),
    ("飞轮的平均角速度", "Mean angular speed of the flywheel"): (_flywheel, "mean"),
    ("放绳滑轮的角速度", "Angular speed of an unwinding pulley"): (_pulley, "rim"),
    ("实心滑轮的转动动能", "Rotational energy of a solid pulley"): (_pulley, "disk"),
    ("由加速度求合力", "Net force from acceleration"): (_translation, "force"),
    ("平动动能", "Translational kinetic energy"): (_translation, "energy"),
    ("质点的动量大小", "Linear momentum magnitude"): (_translation, "momentum"),
}


def _choice(value, unit):
    number = Fraction(value)
    tex = str(number.numerator) if number.denominator == 1 else rf"\frac{{{number.numerator}}}{{{number.denominator}}}"
    units = (r"\,\mathrm{" + unit + "}") if unit else ""
    return rf"\({tex}{units}\)"


def physics_drills(question: RPGChallengeInternal, item: KnowledgeItem, language: str) -> list[RPGChallengeInternal]:
    """Generate four new, fully specified problems anchored to one verified relation."""
    if not item.exam_question or not item.evidence or question.knowledge_id != item.knowledge_id or language not in {"zh", "en"}:
        return []
    source = item.exam_question
    match = _TOPICS.get((source.zh.term, source.en.term))
    if match is None:
        return []
    builder, topic = match
    # Seed from the source exercise rather than from a language or session:
    # retries and bilingual publications should use the same numerical examples.
    seed = sha256(source.en.prompt.encode("utf8")).digest()
    a, b = 3 + seed[0] % 26, 3 + seed[1] % 13
    lang = int(language == "en")
    cards = []
    for i, problem in enumerate(builder(topic, a, b)):
        hint = problem.hint[lang]
        choices = [_choice(n, problem.unit) for n in problem.values]
        working = rf"\({problem.working}\)"
        explanation = f"{hint} {working}" + ("." if lang else "。")
        cards.append(drill_card(question, f"physics-{topic}-{i+1}", problem.en if lang else problem.zh,
                                choices, hint, explanation))
    return cards
