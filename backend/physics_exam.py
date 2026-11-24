"""Offline worked exercises. Select by physical setup AND the requested quantity.

These are conventional physical models, with explicit validity conditions. Each
entry states its assumptions afresh so a standalone prompt never needs an
unseen diagram, an earlier subpart or a PDF's mathematical font encoding.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .models import ExamQuestion, ExamWording


@dataclass(frozen=True)
class Quantity:
    task: str
    topic: tuple[str, str]
    ask: tuple[str, str]
    values: tuple[str, str, str]
    reasoning: tuple[str, str]


@dataclass(frozen=True)
class Family:
    evidence: tuple[str, ...]
    setup: tuple[str, str]
    hint: tuple[str, str]
    targets: tuple[Quantity, ...]


def _math(s):
    return r"\(" + s + r"\)"


def _build(setup, hint, target):
    options = [_math(s) for s in target.values]
    words = []
    for i in (0, 1):
        topic = target.topic[i]
        words.append(
            ExamWording(
                term=topic,
                definition=target.reasoning[i],
                prompt=setup[i] + (" " if i else "") + target.ask[i],
                options=options,
                explanation=target.reasoning[i],
                hint=hint[i],
            )
        )
    return ExamQuestion(zh=words[0], en=words[1], correct_index=0)


FAMILIES = (
    Family(
        (r"siren", r"stationary observer", r"steady wind blowing right", r"siren \(left\)|left.*siren"),
        (
            r"声源在左、听者在右，听者相对地面静止。风以 \(u\) 向右吹，声速相对空气为 \(c\)，声源发射频率为 \(f_s\)。",
            r"A source is left of a listener fixed to the ground. A steady wind blows right at speed \(u\), sound travels at speed \(c\) relative to air, and the source frequency is \(f_s\).",
        ),
        (
            "在地面参考系内，比较相邻两次发射时波峰和声源各自走过的距离。",
            "In the ground frame, compare the distances traveled by a crest and the source in one emission period.",
        ),
        (
            Quantity(
                r"wavelength.*stationary relative",
                ("顺风中静止声源的波长", "Downwind wavelength of a stationary source"),
                (
                    "声源相对地面静止时，向右传播的波长是多少？",
                    "What is the rightward wavelength when the source is fixed to the ground?",
                ),
                (r"(c+u)/f_s", r"(c-u)/f_s", r"c/f_s"),
                (
                    r"地面系的波速为 \(c+u\)。相邻两次发射相隔 \(1/f_s\)，波峰间距为 \((c+u)/f_s\)。",
                    r"In the ground frame a crest travels \(c+u\) per second. The spacing is this speed times the emission period \(1/f_s\).",
                ),
            ),
            Quantity(
                r"siren moves right.*wavelength",
                ("顺风中移动声源的波长", "Downwind wavelength of a moving source"),
                (
                    r"声源以地面速率 \(v_s<c+u\) 向右移动，前方的波长是多少？",
                    r"The source moves right at ground speed \(v_s<c+u\). What is the wavelength ahead of it?",
                ),
                (r"(c+u-v_s)/f_s", r"(c+u+v_s)/f_s", r"(c-u-v_s)/f_s"),
                (
                    r"一个发射周期内，波峰向前走 \((c+u)/f_s\)，声源前进 \(v_s/f_s\)，相减得到前方波长。",
                    r"During one period the crest moves \((c+u)/f_s\) and the source advances \(v_s/f_s\). Their difference is the forward wavelength.",
                ),
            ),
        ),
    ),
    Family(
        (
            r"two identical.*masses",
            r"frictionless horizontal",
            r"(?:spring constant|stiffness)",
            r"coupl.*spring",
            r"fixed wall",
        ),
        (
            r"两个相同质点质量均为 \(m\)，在光滑水平面上运动。每个质点通过劲度 \(k_0\) 的弹簧与外侧固定壁相连，两质点之间用劲度 \(k\) 的弹簧连接。设沿同一方向的平衡位移为 \(x_1,x_2\)。",
            r"Two equal masses \(m\) slide without friction. Each is joined to its outer fixed wall by a spring of stiffness \(k_0\). A spring of stiffness \(k\) joins the masses. Let \(x_1,x_2\) be displacements from equilibrium in the same positive direction.",
        ),
        (
            "连接弹簧的伸长量取决于两个质点的位移之差。",
            "The extension of the coupling spring depends on the difference of the displacements.",
        ),
        (
            Quantity(
                r"equations of motion.*newton",
                ("耦合振子的合力", "Net force in a coupled oscillator"),
                (
                    "牛顿第二定律中，第一个质点所受的合力是哪一项？",
                    "Which is the net force on the first mass in Newton’s second law?",
                ),
                (r"-k_0x_1+k(x_2-x_1)", r"-k_0x_1+k(x_1-x_2)", r"-k_0x_2-k(x_1+x_2)"),
                (
                    r"左侧弹簧施力 \(-k_0x_1\)，连接弹簧对第一质点施力 \(k(x_2-x_1)\)。两者相加即为合力。",
                    r"The wall spring contributes \(-k_0x_1\), and the connecting spring contributes \(k(x_2-x_1)\) on the first mass.",
                ),
            ),
            Quantity(
                r"symmetric mode|symmetric.*frequency",
                ("耦合振子的同相模态", "In-phase oscillation frequency"),
                (
                    "当两个质点始终同相同幅振动时，角频率是多少？",
                    "When both masses move together with equal displacements, what is the angular frequency?",
                ),
                (r"\sqrt{k_0/m}", r"\sqrt{(k_0+2k)/m}", r"\sqrt{2k/m}"),
                (
                    r"同相模态有 \(x_1=x_2\)，连接弹簧伸长量为零，每个质点仅受外侧弹簧的回复力。",
                    r"In the in-phase mode \(x_1=x_2\), so the coupling spring has zero extension. Each mass feels its outer spring alone.",
                ),
            ),
        ),
    ),
    Family(
        (r"effective potential", r"angular momentum", r"sun|planet", r"radial"),
        (
            r"质量为 \(m\) 的行星在质量为 \(M\) 的恒星引力场中运动。距星心 \(r\)，关于星心的角动量大小为 \(L\)，引力常量为 \(G\)。",
            r"A planet of mass \(m\) moves in the gravitational field of a star of mass \(M\). Its radial distance is \(r\), its angular momentum magnitude about the star is \(L\), and the gravitational constant is \(G\).",
        ),
        (
            "将动能按径向和切向分开，并用角动量表示切向速度。",
            "Separate radial and transverse kinetic energy. Express transverse speed in terms of angular momentum.",
        ),
        (
            Quantity(
                r"prove.*effective potential|find.*effective potential",
                ("行星径向运动的有效势能", "Effective radial potential in a gravitational orbit"),
                (
                    "取无穷远引力势能为零，将总能量写成径向动能加有效势能。有效势能是哪一项？",
                    "Set gravitational potential to zero at infinity and write total energy as radial kinetic energy plus effective potential. Which is the effective potential?",
                ),
                (
                    r"\frac{L^2}{2mr^2}-\frac{GMm}{r}",
                    r"-\frac{L^2}{2mr^2}-\frac{GMm}{r}",
                    r"\frac{L^2}{2mr^2}+\frac{GMm}{r}",
                ),
                (
                    r"切向速度是 \(L/(mr)\)，其动能 \(L^2/(2mr^2)\) 与引力势能 \(-GMm/r\) 相加得到有效势能。",
                    r"The transverse speed is \(L/(mr)\); add its kinetic energy \(L^2/(2mr^2)\) to the potential \(-GMm/r\).",
                ),
            ),
        ),
    ),
    Family(
        (r"uniform solid disk pulley", r"(?:cable|string)", r"massless", r"wrapped", r"block"),
        (
            r"质量 \(m\) 的物块系在轻而不可伸长的细线上。细线绕过半径 \(R\)、质量 \(M\) 的均匀实心圆盘滑轮，与滑轮无相对滑动。当物块速率为 \(v\) 时，滑轮绕固定轴旋转。",
            r"A mass \(m\) hangs from a light inextensible cable wound on a uniform solid disk pulley of radius \(R\) and mass \(M\). The cable unwinds without slip. The block's speed is \(v\) and the axle is fixed.",
        ),
        ("从绳速和轮缘线速度相等开始。", "Start with equality of cable speed and rim speed."),
        (
            Quantity(
                r"angular speed",
                ("放绳滑轮的角速度", "Angular speed of an unwinding pulley"),
                ("滑轮的角速度大小是多少？", "What is the magnitude of its angular velocity?"),
                (r"v/R", r"2v/R", r"v/(2R)"),
                (
                    r"轮缘速度满足 \(v=\omega R\)，故 \(\omega=v/R\)。",
                    r"At the rim \(v=\omega R\), so \(\omega=v/R\).",
                ),
            ),
            Quantity(
                r"rotational kinetic energy",
                ("实心滑轮的转动动能", "Rotational energy of a solid pulley"),
                ("滑轮的转动动能为多少？", "What is the rotational kinetic energy of the pulley?"),
                (r"Mv^2/4", r"Mv^2/2", r"Mv^2"),
                (
                    r"将 \(I=MR^2/2\) 与 \(\omega=v/R\) 代入 \(K=I\omega^2/2\)，得 \(Mv^2/4\)。",
                    r"Substitute \(I=MR^2/2\) and \(\omega=v/R\) into \(K=I\omega^2/2\) to get \(Mv^2/4\).",
                ),
            ),
        ),
    ),
    Family(
        (
            r"rectangular uniform slab|uniform rectangular (?:plate|slab)",
            r"through its center",
            r"perpendicular",
        ),
        (
            r"质量为 \(M\) 的均匀薄板绕穿过质心、垂直于板面的轴的转动惯量为 \(I_0\)。",
            r"A uniform plate of mass \(M\) has moment of inertia \(I_0\) about an axis through its center and perpendicular to the plate.",
        ),
        (
            "比较新旧转轴的方向，并找出两轴之间的最短距离。",
            "Compare the axis directions and identify their shortest separation.",
        ),
        (
            Quantity(
                r"axis is shifted|parallel axis",
                ("平行移轴后的转动惯量", "Moment of inertia after shifting a parallel axis"),
                (
                    r"新轴与原轴平行，相距 \(d\)。薄板绕新轴的转动惯量是多少？",
                    r"A new parallel axis is a distance \(d\) away. What is the moment of inertia about it?",
                ),
                (r"I_0+Md^2", r"I_0-Md^2", r"I_0+Md^2/2"),
                (
                    r"根据平行轴定理 \(I=I_{\rm CM}+Md^2\)，其中 \(d\) 是两条平行轴之间的距离。",
                    r"The parallel-axis theorem is \(I=I_{\rm CM}+Md^2\), with \(d\) the perpendicular distance between the axes.",
                ),
            ),
        ),
    ),
    Family(
        (
            r"massless rope",
            r"vertical pole",
            r"full revolutions",
            r"static friction",
            r"prevent it from sliding",
        ),
        (
            r"轻绳绕圆柱形杆 \(N\) 圈，两端张力分别为 \(T_1,T_2\)，且 \(T_2>T_1\)。静摩擦因数为 \(\mu_s\)，绳恰好处在将要滑动的临界状态。",
            r"A light rope wraps \(N\) turns around a cylindrical pole. The tensions satisfy \(T_2>T_1\), the coefficient of static friction is \(\mu_s\), and the rope is on the verge of sliding.",
        ),
        (
            "对小段绳写张力的相对增量，并沿总包角积分。",
            "Relate the fractional tension change on a small element to its wrap angle and integrate.",
        ),
        (
            Quantity(
                r"expression.*t2",
                ("绳绕杆时的临界张力比", "Limiting tension ratio of a wrapped rope"),
                ("拉紧端的张力是多少？", "What is the larger tension?"),
                (r"T_1 e^{2\pi N\mu_s}", r"T_1 e^{-2\pi N\mu_s}", r"T_1(1+2\pi N\mu_s)"),
                (
                    r"沿包角积分 \(dT/T=\mu_s\,d\theta\)，总包角为 \(2\pi N\)，因此 \(T_2=T_1e^{2\pi N\mu_s}\)。",
                    r"Integrating \(dT/T=\mu_s\,d\theta\) across a wrap angle \(2\pi N\) gives \(T_2=T_1e^{2\pi N\mu_s}\).",
                ),
            ),
        ),
    ),
    Family(
        (
            r"(?:uniform solid|solid uniform) cylinder",
            r"(?:string|cord).*?(?:top|uppermost)",
            r"pull(?:ed|s)? horizontally to the right",
            r"rolls? without slip",
            r"rough horizontal",
        ),
        (
            r"均匀实心圆柱质量为 \(M\)、半径为 \(R\)，在粗糙水平面上纯滚动。细线从圆柱顶部水平向右拉，拉力为 \(F\)。",
            r"A uniform solid cylinder of mass \(M\) and radius \(R\) rolls without slipping on a rough level floor. A string pulls horizontally to the right at its top with force \(F\).",
        ),
        (
            "分别列出质心平动、绕质心转动及纯滚动的约束方程。",
            "Combine translation, torque about the center, and the rolling constraint.",
        ),
        (
            Quantity(
                r"acceleration of (?:the )?center|center.of.mass acceleration",
                ("纯滚动的质心加速度", "Center acceleration of a top-pulled cylinder"),
                (
                    "它的质心加速度有多大、指向哪里？取向右为正。",
                    "What is its signed center-of-mass acceleration, taking right to be positive?",
                ),
                (r"+\frac{4F}{3M}", r"+\frac{2F}{3M}", r"-\frac{4F}{3M}"),
                (
                    r"由 \(F+f=Ma\)、\((F-f)R=I\alpha\)、\(I=MR^2/2\) 和 \(a=R\alpha\)，得 \(a=4F/(3M)\)，方向向右。",
                    r"Translation gives \(F+f=Ma\); torque gives \(F-f=Ma/2\). Adding them gives \(a=4F/(3M)\), rightward.",
                ),
            ),
            Quantity(
                r"(?:minimum|least).*coefficient of static friction",
                ("纯滚动所需静摩擦", "Minimum friction for top-pulled rolling"),
                (
                    r"重力加速度为 \(g\)。维持纯滚动至少需要多大的静摩擦因数？",
                    r"With gravity \(g\), what minimum coefficient of static friction keeps the cylinder rolling?",
                ),
                (r"\frac{F}{3Mg}", r"\frac{2F}{3Mg}", r"\frac{F}{Mg}"),
                (
                    r"平动与转动方程给出向右的静摩擦力 \(F/3\)。法向力为 \(Mg\)，故 \(\mu_{\min}=F/(3Mg)\)。",
                    r"The equations of motion give rightward static friction \(F/3\). With normal force \(Mg\), the minimum coefficient is \(F/(3Mg)\).",
                ),
            ),
        ),
    ),
    Family(
        (r"gyroscope", r"(?:massless rod|massless shaft)", r"(?:angle|inclined).*vertical", r"pivot"),
        (
            r"陀螺飞轮的质量为 \(m\)，质心距支点 \(R\)，连接二者的轻杆与竖直方向夹角为 \(\theta\)。",
            r"A gyroscope's flywheel has mass \(m\). Its center lies a distance \(R\) from the pivot along a light rod making angle \(\theta\) with the vertical.",
        ),
        (
            "使用重力作用线到支点的垂直距离。",
            "Find the perpendicular distance between the pivot and the line of gravity.",
        ),
        (
            Quantity(
                r"gravitational torque|torque.*gravity",
                ("陀螺的重力矩", "Gravitational torque on a gyroscope"),
                (
                    "重力对支点的力矩大小是多少？",
                    "What is the magnitude of its gravitational torque about the pivot?",
                ),
                (r"mgR\sin\theta", r"mgR\cos\theta", r"mgR"),
                (
                    r"重力的力臂是 \(R\sin\theta\)，力矩大小为 \(mgR\sin\theta\)。",
                    r"The weight has lever arm \(R\sin\theta\), giving torque magnitude \(mgR\sin\theta\).",
                ),
            ),
        ),
    ),
    Family(
        (r"hydraulic", r"incompressible", r"same (?:height|level)", r"(?:piston|plunger)"),
        (
            r"液压千斤顶的两个活塞等高，面积分别为 \(A_1\) 和 \(A_2\)，且 \(A_2>A_1\)。工作液不可压缩，忽略摩擦与活塞自重。",
            r"An ideal hydraulic jack has level pistons of areas \(A_1\) and \(A_2>A_1\), with incompressible fluid and negligible friction and piston weight.",
        ),
        (
            "区分压强相等的条件与排液体积相等的条件。",
            "Decide whether the task concerns equal pressures or equal swept volumes.",
        ),
        (
            Quantity(
                r"(?:force|required).*lift",
                ("液压举升力", "Hydraulic lifting force"),
                (
                    r"大活塞承载质量为 \(M\) 的物体。在小活塞上至少施加多大的向下力，能使物体刚好升起？",
                    r"The large piston carries mass \(M\). What downward force on the small piston just lifts the load?",
                ),
                (r"Mg\frac{A_1}{A_2}", r"Mg\frac{A_2}{A_1}", r"Mg\frac{A_1+A_2}{A_2}"),
                (
                    r"液体传递相同的压强增量，故 \(F_1/A_1=Mg/A_2\)，得到 \(F_1=MgA_1/A_2\)。",
                    r"Equating the pressure increments gives \(F_1/A_1=Mg/A_2\), hence \(F_1=MgA_1/A_2\).",
                ),
            ),
            Quantity(
                r"distance.*(?:piston|rise)|(?:piston|rise).*distance",
                ("液压活塞的位移", "Hydraulic piston travel"),
                (
                    r"小活塞下降 \(d_1\) 时，大活塞上升多少？",
                    r"If the small piston descends by \(d_1\), how far does the large piston rise?",
                ),
                (r"d_1\frac{A_1}{A_2}", r"d_1\frac{A_2}{A_1}", r"d_1"),
                (
                    r"排液体积守恒，\(A_1d_1=A_2d_2\)，故 \(d_2=d_1 A_1/A_2\)。",
                    r"Volume conservation gives \(A_1d_1=A_2d_2\) and \(d_2=d_1 A_1/A_2\).",
                ),
            ),
        ),
    ),
    Family(
        (r"(?:thin uniform|uniform thin) hoop", r"(?:circumference|rim)", r"pivot", r"small angle"),
        (
            r"均匀细圆环质量为 \(M\)、半径为 \(R\)，可绕环边缘的无摩擦水平轴在竖直面内摆动。将环从平衡位置偏转小角度 \(\theta_0\) 后由静止释放。",
            r"A thin uniform hoop of mass \(M\) and radius \(R\) swings in a vertical plane about a frictionless horizontal pivot on its rim. It is released from rest at a small angle \(\theta_0\) from equilibrium.",
        ),
        (
            "先写出质心相对转轴的距离与转动惯量。",
            "Identify the center-to-pivot distance and moment of inertia about the pivot.",
        ),
        (
            Quantity(
                r"restoring torque|torque.*amplitude",
                ("圆环摆的回复力矩", "Maximum restoring torque of a hoop"),
                (
                    "回复力矩的最大值近似是多少？",
                    "What is the approximate maximum magnitude of the restoring torque?",
                ),
                (r"MgR\theta_0", r"MgR", r"MgR\theta_0^2"),
                (
                    r"重力对支点的力矩大小为 \(MgR\sin\theta\)。在端点取小角近似，最大值约为 \(MgR\theta_0\)。",
                    r"Gravity gives torque magnitude \(MgR\sin\theta\); at the turning point the small-angle result is \(MgR\theta_0\).",
                ),
            ),
            Quantity(
                r"period of oscillation|period.*pendulum",
                ("边缘悬挂圆环的周期", "Period of a rim-pivoted hoop"),
                ("小振荡周期是多少？", "What is the small-oscillation period?"),
                (r"2\pi\sqrt{2R/g}", r"2\pi\sqrt{R/g}", r"2\pi\sqrt{R/(2g)}"),
                (
                    r"平行轴定理给 \(I_{\rm p}=2MR^2\)。代入 \(T=2\pi\sqrt{I_{\rm p}/(MgR)}\)，得 \(2\pi\sqrt{2R/g}\)。",
                    r"The parallel-axis theorem gives \(I_{\rm p}=2MR^2\); the physical-pendulum period is \(2\pi\sqrt{2R/g}\).",
                ),
            ),
        ),
    ),
    Family(
        (r"two stars|binary star", r"circular orbit", r"mutual gravitational", r"common center of mass"),
        (
            r"质量为 \(m_1,m_2\) 的双星在相互引力作用下，绕共同质心做圆周运动。两星之间的距离是 \(r\)，引力常量是 \(G\)。",
            r"Two stars of masses \(m_1,m_2\) orbit their common center of mass in circles under mutual gravity, separated by \(r\). The gravitational constant is \(G\).",
        ),
        (
            "在相对运动中，两星相互指向的加速度大小相加。",
            "In relative motion, the accelerations toward one another add.",
        ),
        (
            Quantity(
                r"find.*angular speed|calculate.*angular (?:speed|velocity)",
                ("双星系统的轨道角速度", "Angular speed of circular binary stars"),
                ("两颗星绕共同质心的角速度大小是多少？", "What is the angular speed of the binary orbit?"),
                (r"\sqrt{G(m_1+m_2)/r^3}", r"\sqrt{Gm_1/r^3}", r"\sqrt{Gm_2/r^3}"),
                (
                    r"相对加速度满足 \(r\omega^2=G(m_1+m_2)/r^2\)，开方得轨道角速度。",
                    r"The relative acceleration is \(r\omega^2=G(m_1+m_2)/r^2\); take the positive square root.",
                ),
            ),
        ),
    ),
    Family(
        (
            r"open.top tanks?",
            r"(?:atmosphere|atmospheric)",
            r"(?:ignoring viscosity|inviscid|negligible viscosity)",
            r"small holes?",
        ),
        (
            r"一只敞口水箱内盛密度为 \(\rho\) 的水，液面与底部小孔都处于大气压 \(p_0\)。水面面积远大于孔面积，忽略黏性。",
            r"An open tank contains water of density \(\rho\). The surface and bottom outlet are exposed to pressure \(p_0\). The surface area greatly exceeds the outlet area; viscosity is negligible.",
        ),
        (
            "先分清孔口关闭时的静水条件和开启后的能量关系。",
            "Distinguish hydrostatic balance before opening from Bernoulli flow after opening.",
        ),
        (
            Quantity(
                r"gauge pressures?|pressure.*gauge",
                ("静水底部的表压", "Gauge pressure at a tank bottom"),
                (
                    r"堵住小孔，水深为 \(H\)。孔口处相对于大气的表压是多少？",
                    r"With the outlet sealed and water depth \(H\), what is the gauge pressure at the outlet?",
                ),
                (r"\rho gH", r"p_0+\rho gH", r"p_0"),
                (
                    r"绝对压强为 \(p_0+\rho gH\)，取大气压为零点得到表压 \(\rho gH\)。",
                    r"Absolute pressure is \(p_0+\rho gH\); subtracting atmospheric pressure gives gauge pressure \(\rho gH\).",
                ),
            ),
            Quantity(
                r"exit speed|speed.*water jet",
                ("水箱小孔的出流速度", "Tank outlet speed"),
                (
                    r"打开小孔，在瞬时水深为 \(h\) 时，水流刚离开小孔的速率是多少？",
                    r"At an instantaneous water depth \(h\), what is the exit speed of the jet?",
                ),
                (r"\sqrt{2gh}", r"\sqrt{gh}", r"2\sqrt{gh}"),
                (
                    r"液面速度可忽略，两端压强相同。伯努利方程给出 \(\rho gh=\rho v^2/2\)，故 \(v=\sqrt{2gh}\)。",
                    r"Surface speed is negligible and both ends have equal pressure. Bernoulli gives \(\rho gh=\rho v^2/2\), hence \(v=\sqrt{2gh}\).",
                ),
            ),
        ),
    ),
    Family(
        (r"elliptic(?:al)? (?:trajectory|orbit)", r"semi.major axis", r"eccentricity", r"sun|central mass"),
        (
            r"行星在质量为 \(M\) 的恒星引力作用下沿椭圆轨道运动。行星质量可忽略，半长轴为 \(a\)，轨道偏心率为 \(e\)，引力常量为 \(G\)。",
            r"A planet of negligible mass follows an elliptical orbit about a star of mass \(M\). Its semimajor axis is \(a\), eccentricity is \(e\), and the gravitational constant is \(G\).",
        ),
        (
            "半长轴决定轨道周期，轨道两端的速度服从能量守恒。",
            "The semimajor axis fixes the period; energy conservation relates the speeds at the apsides.",
        ),
        (
            Quantity(
                r"period",
                ("椭圆轨道的公转周期", "Period of an elliptic orbit"),
                ("行星的公转周期是多少？", "What is the orbital period?"),
                (r"2\pi\sqrt{a^3/(GM)}", r"2\pi\sqrt{[a(1-e)]^3/(GM)}", r"2\pi\sqrt{[a(1+e)]^3/(GM)}"),
                (
                    r"开普勒第三定律给出 \(T^2=4\pi^2 a^3/(GM)\)，其中 \(a\) 是半长轴。",
                    r"Kepler’s third law is \(T^2=4\pi^2 a^3/(GM)\) with \(a\) the semimajor axis.",
                ),
            ),
        ),
    ),
    Family(
        (r"frictionless track", r"loop", r"starts? from rest", r"height"),
        (
            r"一小物块从静止释放，沿光滑轨道进入竖直圆环。圆环半径为 \(R\)，释放点比环底高 \(h\)，重力加速度为 \(g\)。",
            r"A small block starts from rest on a frictionless track and enters a vertical loop of radius \(R\). The release point is height \(h\) above the bottom; gravity is \(g\).",
        ),
        (
            "以环底为重力势能零点，比较释放位置和目标位置的机械能。",
            "Take the bottom as zero gravitational potential and compare initial and final mechanical energy.",
        ),
        (
            Quantity(
                r"speed.*bottom",
                ("滑块在环底的速度", "Block speed at the loop bottom"),
                ("滑块经过环底时的速率为多少？", "What is the block’s speed at the bottom?"),
                (r"\sqrt{2gh}", r"\sqrt{gh}", r"\sqrt{2g(h+R)}"),
                (
                    r"能量守恒给 \(mgh=mv^2/2\)，故 \(v=\sqrt{2gh}\)。",
                    r"Energy conservation gives \(mgh=mv^2/2\), hence \(v=\sqrt{2gh}\).",
                ),
            ),
            Quantity(
                r"speed.*top",
                ("滑块在环顶的速度", "Block speed at the loop top"),
                (
                    "假设滑块能保持接触并到达环顶，经过环顶时的速率为多少？",
                    "Assuming it reaches the top in contact with the track, what is its speed there?",
                ),
                (r"\sqrt{2g(h-2R)}", r"\sqrt{2g(h-R)}", r"\sqrt{2gh}"),
                (
                    r"环顶高出环底 \(2R\)，动能为 \(mg(h-2R)\)，故 \(v=\sqrt{2g(h-2R)}\)。",
                    r"The top is \(2R\) above the bottom; the remaining kinetic energy is \(mg(h-2R)\).",
                ),
            ),
            Quantity(
                r"minimum height",
                ("竖直圆环的临界释放高度", "Minimum loop release height"),
                (
                    "物块刚好绕过整个圆环时，最小释放高度是多少？",
                    "What minimum release height permits a complete loop with contact?",
                ),
                (r"5R/2", r"2R", r"3R/2"),
                (
                    r"临界时环顶的支持力为零，故 \(v^2=gR\)。能量守恒给 \(h=2R+v^2/(2g)=5R/2\)。",
                    r"At the threshold the top normal force vanishes, so \(v^2=gR\); energy gives \(h=2R+v^2/(2g)=5R/2\).",
                ),
            ),
        ),
    ),
)


def _flywheel(setup, ask):
    if not (
        "constant angular acceleration" in setup.lower()
        or "angular acceleration is constant" in setup.lower()
    ):
        return None
    number = r"([+]?\d+(?:\.\d+)?)"
    accel = re.search(
        r"angular acceleration (?:is|of)\s*" + number + r"\s*rad\s*/\s*s(?:\^?2|²)", setup, re.I
    )
    speed = re.search(r"angular (?:velocity|speed) of\s*" + number + r"\s*rad\s*/\s*s\b", setup, re.I)
    elapsed = re.search(r"(?:at\s+t\s*=\s*|in\s+)" + number + r"\s*s\b", setup, re.I)
    if not (speed and elapsed):
        return None
    omega, dt = float(speed[1]), float(elapsed[1])
    if dt <= 0:
        return None
    start_rest = re.search(r"starts? from rest", setup, re.I)
    if not accel and not start_rest:
        return None
    alpha = float(accel[1]) if accel else omega / dt
    initial = omega - alpha * dt
    if initial < 0:
        return None
    scenarios = (
        f"飞轮做匀角加速转动。经过 {dt:g} s，其角速度达到 {omega:g} rad/s。",
        f"A flywheel rotates with constant angular acceleration. After {dt:g} s its angular speed is {omega:g} rad/s.",
    )
    if accel:
        given = (f"角加速度为 {alpha:g} rad/s²。", f"Its angular acceleration is {alpha:g} rad/s². ")
    else:
        given = ("飞轮从静止开始。", "It starts from rest. ")
    setup_text = tuple(s + (" " if i else "") + g for i, (s, g) in enumerate(zip(scenarios, given)))
    if re.search(r"initial angular (?:speed|velocity)", ask, re.I) and accel:
        name = ("飞轮的初始角速度", "Initial angular speed of the flywheel")
        prompt = ("初始角速度的大小是多少？", "What was its initial angular speed?")
        correct, unit, eq = initial, r"\mathrm{rad/s}", r"\omega_0=\omega_f-\alpha t"
    elif re.search(r"angular displacement|how many radians", ask, re.I):
        name = ("匀角加速飞轮的角位移", "Angle swept at constant angular acceleration")
        prompt = (
            "这一段时间转过的角位移大小是多少？",
            "What angle does it sweep through during that interval?",
        )
        correct, unit, eq = (
            (omega + initial) * dt / 2,
            r"\mathrm{rad}",
            r"\Delta\theta=(\omega_0+\omega_f)t/2",
        )
    elif re.search(r"average angular (?:speed|velocity)", ask, re.I):
        name = ("飞轮的平均角速度", "Mean angular speed of the flywheel")
        prompt = (
            "这个过程中平均角速度的大小是多少？",
            "What is its mean angular speed during that interval?",
        )
        correct, unit, eq = (omega + initial) / 2, r"\mathrm{rad/s}", r"\bar\omega=(\omega_0+\omega_f)/2"
    elif start_rest and re.search(r"angular acceleration", ask, re.I):
        name = ("从静止启动的角加速度", "Angular acceleration from rest")
        prompt = ("角加速度的大小是多少？", "What is the magnitude of the angular acceleration?")
        correct, unit, eq = alpha, r"\mathrm{rad/s^2}", r"\alpha=(\omega_f-\omega_0)/t"
    else:
        return None
    # Use reproducible numeric alternatives with identical dimensions.
    # Significant figures follow the printed decimal precision, up to three.
    numbers = [speed[1], elapsed[1], *([accel[1]] if accel else [])]
    sf = min(3, *(max(2, len(s.replace(".", "").lstrip("0"))) for s in numbers))

    def fmt(x):
        return f"{x:.{sf}g}" + r"\," + unit

    choices = tuple(
        fmt(n) for n in (correct, 2 * correct if correct else omega, correct / 2 if correct else omega / 2)
    )
    if len(set(choices)) != 3:
        return None
    value = _math(fmt(correct))
    reasoning = (
        "利用 " + _math(eq) + "，代入题给数据得到 " + value + "。",
        "Using " + _math(eq) + " with the stated data gives " + value + ".",
    )
    return _build(
        setup_text,
        (
            "画出角速度随时间的直线，标出起点与终点。",
            "Sketch the straight angular-speed versus time line and mark its end points.",
        ),
        Quantity("", name, prompt, choices, reasoning),
    )


def _beam(setup, ask):
    if (
        not all(
            re.search(s, setup, re.I)
            for s in (
                "uniform horizontal beam",
                "hinged",
                "equilibrium",
                "cable attached to its right end",
                "angle.*above the beam",
                "point mass",
            )
        )
        or "tension" not in ask.lower()
    ):
        return None
    offset = re.search(r"distance\s+(\d+)L\s*/\s*(\d+)\s+from the hinge", setup, re.I)
    if not offset:
        return None
    n, d = map(int, offset.groups())
    if not 0 < n < d:
        return None
    share = rf"\frac{{{n}}}{{{d}}}"
    arm = rf"{n}L/{d}"
    return _build(
        (
            rf"均匀水平梁质量为 \(M\)、长 \(L\)，左端铰接。在距铰链 \({arm}\) 处悬挂质量 \(m\) 的物体。右端轻缆与水平梁成 \(\theta\) 角，使梁静止。",
            rf"A uniform horizontal beam of mass \(M\) and length \(L\) is hinged on the left. A mass \(m\) hangs a distance \({arm}\) from the hinge. A light cable at the right end makes angle \(\theta\) with the beam and holds it in equilibrium.",
        ),
        (
            "选择铰链为取矩点，计入梁自身的重力。",
            "Take torques about the hinge and include the beam's own weight.",
        ),
        Quantity(
            "",
            ("水平梁的支承缆张力", "Cable tension supporting a loaded beam"),
            ("轻缆的张力大小是多少？", "What is the cable tension?"),
            (
                rf"\frac{{(M/2+{share}m)g}}{{\sin\theta}}",
                rf"\frac{{(M+{share}m)g}}{{\sin\theta}}",
                rf"(M/2+{share}m)g\sin\theta",
            ),
            (
                rf"铰链处力矩平衡给出 \(TL\sin\theta=MgL/2+mg({arm})\)。两端同除以 \(L\sin\theta\) 即得张力。",
                rf"Torque balance gives \(TL\sin\theta=MgL/2+mg({arm})\). Divide by \(L\sin\theta\) to obtain the tension.",
            ),
        ),
    )


def _string_transit(setup, ask):
    if not (
        re.search(r"(three pieces|three segments).*string.*each of length", setup, re.I)
        and "tension" in ask.lower()
        and "time" in ask.lower()
    ):
        return None
    compact = re.sub(r"\s+", "", setup.lower())
    ratios = re.search(r"μ2=(\d+)μ1,?andμ3=μ1/(\d+)", compact)
    if not ratios:
        return None
    a, b = map(int, ratios.groups())
    if a < 1 or b < 1:
        return None
    factor = 1 + math.sqrt(a) + 1 / math.sqrt(b)
    # Formula alternatives stay exact for arbitrary ratios, with units of time.
    return _build(
        (
            rf"三段轻弦串联，每段长 \(L\)，共同张力为 \(F\)。沿弦依次有线密度 \(\mu\)、\({a}\mu\)、\(\mu/{b}\)。",
            rf"Three uniform strings, each of length \(L\), are joined end to end under tension \(F\). Their linear densities are \(\mu\), \({a}\mu\), and \(\mu/{b}\).",
        ),
        ("每一段分别用弦波速计算传播时间。", "Compute the transit time on each string separately."),
        Quantity(
            "",
            ("分段弦的波传播时间", "Travel time along joined strings"),
            (
                "横波从一端传到另一端需多长时间？",
                "How long does a transverse wave take to travel the entire length?",
            ),
            (
                rf"(1+\sqrt{{{a}}}+1/\sqrt{{{b}}})L\sqrt{{\mu/F}}",
                r"L\sqrt{\mu/F}",
                rf"({1 + factor:.3g})L\sqrt{{\mu/F}}",
            ),
            (
                r"各段波速为 \(v_i=\sqrt{F/\mu_i}\)，总时间是三段的 \(L/v_i\) 之和。",
                r"Wave speed on each segment is \(v_i=\sqrt{F/\mu_i}\); sum the three transit times \(L/v_i\).",
            ),
        ),
    )


def _numeric_mechanics(setup, ask):
    """Quantity-driven problems, independent of names, paper layout and course code."""
    num = r"(?<![\w.\-−])(\d+(?:\.\d+)?)\s*"
    mass = re.findall(num + r"kg\b", setup, re.I)
    if len(mass) != 1 or not re.search(
        r"cart|object|body|particle|block|puck|car\b|小车|物体|滑块|质点", setup, re.I
    ):
        return None
    # Multiple objects, unspecified vector projections and changing masses need more information.
    if re.search(
        r"colli(?:de|sion)|explod|rocket|rotat|relativ|inclin|doubl|tripl|halv|摩擦|碰撞|转动|翻倍|减半",
        setup + " " + ask,
        re.I,
    ):
        return None
    speed = re.findall(num + r"m\s*/\s*s\b(?!\s*(?:\^?2|²))", setup, re.I)
    accel = re.findall(num + r"m\s*/\s*s(?:\^?2|²)\b", setup, re.I)
    m = float(mass[0])
    if m <= 0:
        return None
    if len(accel) == 1 and re.search(r"(?:net|resultant) force|合力", ask, re.I):
        value = float(accel[0])
        answer = m * value
        unit = r"\mathrm{N}"
        equation = r"F_{\rm net}=ma"
        zs, es = f"加速度大小为 {value:g} m/s²。", f"Its acceleration magnitude is {value:g} m/s²."
        names = ("由加速度求合力", "Net force from acceleration")
        asks = ("它所受合力的大小是多少？", "What is the magnitude of the net force on it?")
    elif (
        len(speed) == 1
        and re.search(r"(?:its |the |translational )kinetic energy|动能", ask, re.I)
        and not re.search(r"change|lost|increas|变化|损失", ask, re.I)
    ):
        value = float(speed[0])
        answer = 0.5 * m * value**2
        unit = r"\mathrm{J}"
        equation = r"K=mv^2/2"
        zs, es = f"平动速率为 {value:g} m/s。", f"Its translational speed is {value:g} m/s."
        names = ("平动动能", "Translational kinetic energy")
        asks = ("它的平动动能是多少？", "What is its translational kinetic energy?")
    elif (
        len(speed) == 1
        and re.search(r"momentum|动量", ask, re.I)
        and not re.search(r"angular|change|difference|角动量|改变量", ask, re.I)
    ):
        value = float(speed[0])
        answer = m * value
        unit = r"\mathrm{kg\,m/s}"
        equation = r"p=mv"
        zs, es = f"运动速率为 {value:g} m/s。", f"Its speed is {value:g} m/s."
        names = ("质点的动量大小", "Linear momentum magnitude")
        asks = ("它的动量大小是多少？", "What is its linear momentum magnitude?")
    else:
        return None
    if not 0 < answer < 1e16:
        return None
    opts = tuple(f"{x:.4g}" + r"\," + unit for x in [answer, 2 * answer, 0.5 * answer])
    reason = (
        "将题给数据代入 " + _math(equation) + "，得到 " + _math(opts[0]) + "。",
        "Substituting into " + _math(equation) + " gives " + _math(opts[0]) + ".",
    )
    return _build(
        (f"物体质量为 {m:g} kg，" + zs, f"An object has mass {m:g} kg. " + es),
        (
            "先写出所求物理量与已知量之间的关系式。",
            "Write the relation between the requested quantity and the given measurements.",
        ),
        Quantity("", names, asks, opts, reason),
    )


def _vectors(setup, ask):
    """Recover two explicit 3-D basis expansions, refusing unparsed coefficients."""
    normalized = setup.replace("−→", "").replace("→", "").replace("⃗", "").replace("−", "-")
    variable = r"[A-Za-z\ue000-\uf8ff]\d*"
    labels = re.findall(r"(" + variable + r")\s*=", normalized)
    if len(labels) != 2 or labels[0] == labels[1]:
        return None
    # This legacy math font encodes italic i as U+EBE9. Accept it only as
    # one basis vector in an explicit adjacent i,j,k unit-vector expression.
    normalized = normalized.replace("ˆ\uebe9", "^i").replace("b\uebe9", "^i")
    normalized = re.sub(r"(?:ˆ|(?<=\d)b|(?<=[+ -])b)\s*([ijk])", r"^\1", normalized)
    normalized = normalized.replace(" ", "")
    rhs = re.findall(r"=([+\-\d.^ijk]+)", normalized)
    if len(rhs) != 2:
        return None

    def components(expression):
        expression = expression.rstrip(".")
        terms = re.findall(r"([+-]?)(\d*(?:\.\d+)?)(?:\^)([ijk])", expression)
        if not terms or "".join(s + c + "^" + b for s, c, b in terms) != expression:
            return None
        if len(set(b for _, _, b in terms)) != len(terms):
            return None
        return tuple(
            sum((-1 if s == "-" else 1) * float(c or 1) for s, c, b in terms if b == basis) for basis in "ijk"
        )

    u, v = map(components, rhs)
    if u is None or v is None:
        return None

    def fmt(x):
        return f"{x:g}"

    def vec(row):
        return r"\left(" + ",".join(fmt(x) for x in row) + r"\right)"

    expression = ask.replace("−→", "").replace("⃗", "").replace("→", "").strip()
    expression = re.sub(r"^(?:what is|find|calculate|evaluate|determine)\s*", "", expression, flags=re.I)
    expression = expression.strip("().? ").replace(" ", "")
    operation = re.fullmatch(rf"({variable})([+×·⋅])(\d+(?:\.\d+)?)?({variable})", expression)
    if not operation or {operation[1], operation[4]} != set(labels):
        return None
    if operation[3] and operation[2] != "×":
        return None
    if operation[1] == labels[1]:
        u, v = v, u
    src = (
        rf"在同一个右手直角坐标系中，两个向量的分量分别为 \(\mathbf u={vec(u)}\) 和 \(\mathbf v={vec(v)}\)。",
        rf"In the same right-handed Cartesian frame, two vectors have components \(\mathbf u={vec(u)}\) and \(\mathbf v={vec(v)}\).",
    )
    if "+" in ask:
        names = ("向量的分量加法", "Addition by vector components")
        asks = (r"求 \(\mathbf u+\mathbf v\)。", r"Find \(\mathbf u+\mathbf v\).")
        values = tuple(
            map(
                vec,
                [
                    tuple(a + b for a, b in zip(u, v)),
                    tuple(a - b for a, b in zip(u, v)),
                    tuple(a + b * 2 for a, b in zip(u, v)),
                ],
            )
        )
        reason = ("两个向量沿各坐标轴的分量分别相加。", "Add the corresponding components along each axis.")
    elif "×" in ask:
        # A scalar factor may precede the second vector, e.g. u × 4v.
        factor = float(operation[3] or 1)
        cr = tuple(
            factor * (u[(i + 1) % 3] * v[(i + 2) % 3] - u[(i + 2) % 3] * v[(i + 1) % 3]) for i in range(3)
        )
        coeff = "" if factor == 1 else fmt(factor)
        names = ("右手系中的向量叉积", "Cross product in a right-handed frame")
        asks = (
            rf"求 \(\mathbf u\times({coeff}\mathbf v)\)。",
            rf"Find \(\mathbf u\times({coeff}\mathbf v)\).",
        )
        values = tuple(map(vec, [cr, tuple(-n for n in cr), tuple(n * 2 for n in cr)]))
        reason = (
            "用右手坐标系的叉积展开式计算三个分量，并计入向量前的标量系数。",
            "Use the right-handed cross-product expansion and include the scalar multiplying the second vector.",
        )
    else:
        names = ("向量的点积", "Dot product by components")
        asks = (
            r"求标量积 \(\mathbf u\cdot\mathbf v\)。",
            r"Find the scalar product \(\mathbf u\cdot\mathbf v\).",
        )
        dot = sum(a * b for a, b in zip(u, v))
        values = tuple(fmt(x) for x in [dot, abs(dot) if dot < 0 else -dot, math.dist(u, v)])
        reason = (
            "分别相乘对应坐标分量后求和。",
            "Multiply corresponding components and sum the three products.",
        )
    if len(set(values)) != 3:
        return None
    why = (
        reason[0] + "结果为 " + _math(values[0]) + "。",
        reason[1] + " This gives " + _math(values[0]) + ".",
    )
    return _build(
        src,
        ("先列出两个向量在三个基方向上的分量。", "List the three basis components of each vector first."),
        Quantity("", names, asks, values, why),
    )


def solve_part(setup, ask):
    # Conditions and task are intentionally matched separately. A worked
    # answer or a formula sheet can never activate a solver.
    if not setup or not ask:
        return None
    # A modifier can change the physical model even if every original keyword
    # remains in the text (e.g. another force after the rolling condition).
    conditions = setup + " " + ask
    if re.search(
        r"\b(?:instead|except|contrary|actually|however|whereas|rather than|"
        r"not (?:be |a |an )?(?:uniform|solid|level|horizontal|constant|negligible|massless|"
        r"incompressible|frictionless|roll\w*|static|fixed|conserved|stationary|parallel|equal)|"
        r"never|no longer|nonuniform|non-uniform|nonideal|non-ideal|nonnegligible|"
        r"cannot|can't|doesn't|isn't|additional|additionally|extra|also (?:apply|acts?|pull)|"
        r"second (?:force|string|cable|load)|another|external force|opposing force|"
        r"resistive (?:force|torque)|drag force|rolling resistance|inclined (?:floor|plane)|"
        r"applied (?:couple|torque)|coefficient of kinetic friction)\b",
        conditions,
        re.I,
    ):
        return None
    if "cylinder" in setup.casefold() and re.search(
        r"\b(?:hollow|incline|inclined|slope|downhill|uphill|leftward pull|slips|begins to slip|"
        r"starts sliding|internal motor|counterweight|sliding friction|pull(?:ed|s)? (?:down|up))\b",
        setup + " " + ask,
        re.I,
    ):
        return None
    for solver in (_flywheel, _beam, _string_transit, _vectors, _numeric_mechanics):
        numerical = solver(setup, ask)
        if numerical:
            return numerical
    for family in FAMILIES:
        if not all(re.search(pattern, setup, re.I) for pattern in family.evidence):
            continue
        for target in family.targets:
            if re.search(target.task, ask, re.I):
                return _build(family.setup, family.hint, target)
    return None
