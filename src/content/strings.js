/**
 * TXST Quad Taco Tycoon — dialogue only; no game-state mutations.
 * Keep IDs stable: saves and story events may refer to them.
 * Display using textContent (never innerHTML).
 */
import { characterLines } from './character-copy.js';
import { semesterLines } from './semester-copy.js';

const DATA = {
  // Every crew member has >=8 options for every bark context.
  'jared.idle': [
    'Register is ready. I was born ready.', 'Anybody got change for a twenty?',
    'My backwards cap means business.', 'I just balanced the tip jar.',
    'The line is quiet. Suspicious.', 'Cash box is looking professional.',
    'I named the register Gerald.', 'Do we take Bobcat Bucks? Asking.'
  ],
  'jared.rush': [
    'Next! Please form one very real line!', 'I need a second set of fingers!',
    'Gerald the register is sweating!', 'Tickets! I have so many tickets!',
    'Everybody breathe. And pay.', 'Exact change is a love language!',
    'The Quad has discovered lunch!', 'I can count faster than this!'
  ],
  'jared.sale': [
    'Another happy transaction!', 'Gerald says thank you.',
    'And that makes one more taco sold.', 'That receipt is a work of art.',
    'Money in, tacos out.', 'A beautiful five-dollar moment.',
    'This is called revenue, folks.', 'Keep the good change coming!'
  ],
  'jared.combo': [
    'That combo deserves a receipt frame!', 'Two orders, one smooth checkout!',
    'We are cooking AND accounting!', 'The register has rhythm!',
    'That was a perfect handoff!', 'Triple combo? Gerald approves!',
    'These numbers are getting spicy!', 'This is what synergy SHOULD mean!'
  ],
  'jared.mistake': [
    'I rang up one emotional support taco.', 'Wrong button. Correct spirit.',
    'Hold on, Gerald disagrees.', 'I gave the receipt to a grackle.',
    'That is not the total I expected.', 'I owe you twelve cents. Sorry!',
    'I counted the tip jar twice.', 'Refunding that with dignity.'
  ],
  'jared.closing': [
    'Last sale! Gerald gets a nap.', 'Counting tips is my sunset ritual.',
    'We made it through another rush.', 'Drawer balanced. Mostly.',
    'No more tickets. My favorite sound.', 'One more day toward nationals.',
    'Cash is safe. Where is my taco?', 'Good work, team. We earned dusk.'
  ],
  'phillip.idle': [
    'Everything has a prep station.', 'Queso needs respect.',
    'I sharpened my imaginary knife.', 'The cilantro is standing by.',
    'I sorted the toppings by destiny.', 'I could prep with my eyes closed.',
    'Please stop moving my onions.', 'The salsa has a personal space.'
  ],
  'phillip.rush': [
    'Two beans, one brisket, coming up!', 'Ali, tortillas incoming!',
    'My mise en place has left the chat!', 'I need another tub of pico!',
    'Do not rush the queso!', 'Assembly line, keep it moving!',
    'This counter is pure choreography!', 'Who ordered extra everything?'
  ],
  'phillip.sale': [
    'Look at that clean fold.', 'One masterpiece, wrapped.',
    'My salsa made somebody smile.', 'That is a balanced taco.',
    'A little queso goes a long way.', 'Fresh toppings, happy people.',
    'Please admire the onion placement.', 'Another taco leaves the nest.'
  ],
  'phillip.combo': [
    'Prep to grill! Beautiful toss!', 'Our hands are in sync today!',
    'That was a four-taco ballet!', 'Topping streak, do not blink!',
    'Ali caught every tortilla!', 'This line has actual rhythm!',
    'Stacking orders like a legend!', 'Golden Handoff! I saw that!'
  ],
  'phillip.mistake': [
    'That was cilantro, not confetti.', 'Oops. Too much salsa.',
    'Someone moved my labeled tub.', 'That tortilla folded itself wrong.',
    'I made a very abstract taco.', 'Hold up, wrong topping!',
    'The queso chose chaos.', 'Remaking that one, no shortcuts.'
  ],
  'phillip.closing': [
    'The counter is clean. Finally.', 'Leftover cilantro goes home.',
    'My prep tubs survived us.', 'I am emotionally attached to this spatula.',
    'Tomorrow I label EVERYTHING.', 'We fed a lot of Bobcats today.',
    'Queso secured for the night.', 'I call dibs on the last tortilla.'
  ],
  'ali.idle': [
    'Grill is warm. So is my confidence.', 'I can hear a tortilla thinking.',
    'No one touches my good spatula.', 'This salsa needs a smoky note.',
    'Yes, that flip was intentional.', 'I have a reputation to maintain.',
    'The secret is patience. And heat.', 'Is Mrs. West coming today? No reason.'
  ],
  'ali.rush': [
    'Hot grill! Watch the elbows!', 'Phillip, send the next batch!',
    'I need tortillas, not opinions!', 'That sizzle means business!',
    'Two at once? Easy!', 'Keep the line fed!',
    'I am running a tiny fire kingdom!', 'This grill and I are one!'
  ],
  'ali.sale': [
    'Perfect char. You are welcome.', 'That taco got my signature flip.',
    'Another masterpiece off the heat.', 'Taste the smoky victory.',
    'Fresh off the grill!', 'I call that the San Marcos special.',
    'Quality has entered the Quad.', 'That one deserves a slow clap.'
  ],
  'ali.combo': [
    'Double flip! Did you SEE that?', 'Three clean catches!',
    'Phillip, beautiful toss!', 'Grill streak is alive!',
    'This is my championship round!', 'The spatula demands applause!',
    'Golden Handoff. Absolutely golden.', 'Not a single tortilla dropped!'
  ],
  'ali.mistake': [
    'That char is a little too bold.', 'New taco. No compromises.',
    'The grill had a different plan.', 'Do not tell Mrs. West.',
    'Okay, that was not a trick flip.', 'I owe that tortilla an apology.',
    'Heat down. Reset.', 'We do not serve sad tacos.'
  ],
  'ali.closing': [
    'Grill off. Legend resting.', 'That was a good day at the fire.',
    'Someone hide my spatula from Matt.', 'Mrs. West liked the salsa, right?',
    'Clean grill, clear conscience.', 'I could go for one more taco.',
    'Tomorrow, the perfect double flip.', 'I think the Quad smelled amazing.'
  ],
  'matt.idle': [
    'Runner ready. Shoes tied twice.', 'I know every crack in this Quad.',
    'Tray balance is a lifestyle.', 'Can I deliver to the river?',
    'I have a towel for every crisis.', 'My legs are on standby.',
    'That grackle is following me.', 'The Stallions are my route markers.'
  ],
  'matt.rush': [
    'Coming through with tacos!', 'Hot tray, friendly runner!',
    'Order for {name}!', 'I can make the pickup!',
    'Two hands, three orders, no fear!', 'Clear a lane on the Quad!',
    'Running on taco fumes!', 'Who ordered the extra salsa?'
  ],
  'matt.sale': [
    'Delivered with a smile!', 'Made it before the next bell.',
    'One more happy handoff.', 'Tray returned, mission complete.',
    'I even remembered the napkins.', 'That customer waved back!',
    'From grill to grin.', 'Fast feet, warm tacos.'
  ],
  'matt.combo': [
    'Back-to-back handoffs!', 'I am the tray whisperer!',
    'Three orders! No spills!', 'Taco relay world record!',
    'Phillip to Ali to me. Boom!', 'Look at these clean routes!',
    'Golden Handoff, baby!', 'Did I just outrun a grackle?'
  ],
  'matt.mistake': [
    'Oops. Salsa took a field trip.', 'Wrong table. Easy fix!',
    'That napkin escaped.', 'I nearly raced a tour group.',
    'Sorry! Coming right back!', 'The tray tilted. I did not.',
    'I delivered my own lunch by mistake.', 'Fresh order on its way!'
  ],
  'matt.closing': [
    'My legs are officially off duty.', 'The Quad is peaceful again.',
    'I walked approximately to Austin.', 'Towel washed, tray stacked.',
    'I am racing the sunset home.', 'No dropped trays today. Almost.',
    'Who has the closing photo?', 'Tomorrow, I am wearing better socks.'
  ],
  'aaron.idle': [
    'Team, I have a very small plan.', 'One stand. One giant ambition.',
    'SIFE nationals are not paying themselves.', 'This is definitely a business.',
    'I have the headset. I am in charge.', 'Did anyone read my checklist?',
    'We might actually pull this off.', 'Remember: quality before chaos.'
  ],
  'aaron.rush': [
    'Call the Line! Eyes up!', 'Quick huddle. No actual huddling!',
    'Protect the grill!', 'We can handle this wave!',
    'Jared, keep the line moving!', 'Matt, take the short route!',
    'Good tacos first. Panic second.', 'One decision. Make it count.'
  ],
  'aaron.sale': [
    'That is one step closer to nationals.', 'We built this with folding tables.',
    'Proud of this crew.', 'See? The plan is working.',
    'Good service, good day.', 'Every regular matters.',
    'That smile beats a spreadsheet.', 'Keep that momentum.'
  ],
  'aaron.combo': [
    'That is a Golden Handoff!', 'The entire line clicked!',
    'That is what teamwork looks like!', 'We have found our rhythm!',
    'That combo is going in the scrapbook!', 'Two stands someday. I can feel it.',
    'Nobody tell Synergy our secret!', 'Absolutely beautiful execution.'
  ],
  'aaron.mistake': [
    'Okay. Reset, do not rush.', 'That is on us. Make it right.',
    'Good catch. Fix the ticket.', 'We can own that mistake.',
    'No shortcuts with hot food.', 'Tomorrow, better prep.',
    'I made the wrong call. Adjust.', 'The checklist gets another line.'
  ],
  'aaron.closing': [
    'Circle up. One highlight each.', 'The cash matters. So do the people.',
    'Another day toward the SIFE trip.', 'All right, crew. Photo time.',
    'That was chaos worth remembering.', 'We did good today.',
    'Lock up. San Marcos looks beautiful.', 'Same friends, better business.'
  ],
  'antonio.idle': [
    'My laptop is a community resource.', 'TACO-NET is still in beta.',
    'These stickers are my credentials.', 'I only hack fictional systems.',
    'What if the Quad had push alerts?', 'My cursor has stage fright.',
    'I wrote an algorithm for salsa.', 'Dale cannot prove anything. Yet.'
  ],
  'antonio.rush': [
    'Booting tactical taco outreach!', 'One hack, infinite potential!',
    'The laptop says MORE TACOS!', 'Campus demand incoming!',
    'Typing with dramatic urgency!', 'I may have found a shortcut!',
    'This is growth hacking! Literally!', 'Please ignore the warning light.'
  ],
  'antonio.sale': [
    'Organic growth! Mostly organic.', 'My funnel converted!',
    'Another satisfied end user.', 'We have product-market tortilla!',
    'That sale was algorithm-adjacent.', 'TACO-NET has fans!',
    'I am logging this as a win.', 'Our outreach is working!'
  ],
  'antonio.combo': [
    'Viral taco velocity!', 'The engagement graph is dancing!',
    'My code and Ali are unstoppable!', 'Combo chain: fully optimized!',
    'I have invented lunch 2.0!', 'That was a beautiful spike!',
    'Please let me name this milestone.', 'Synergy could never.'
  ],
  'antonio.mistake': [
    'That popup was not part of the plan.', 'Uh-oh. Dean calendar. Wrong tab.',
    'I can explain the error tone.', 'Dale? Why is Dale walking here?',
    'A minor publicity malfunction.', 'The alert had a tiny typo.',
    'I clicked the suspiciously big button.', 'My laptop wishes to remain silent.'
  ],
  'antonio.closing': [
    'Laptop asleep. Secrets safe.', 'Deleting my twelve fake dashboards.',
    'I left TACO-NET on a sticky note.', 'Tomorrow: fewer warning sounds.',
    'Our reach was extraordinary.', 'Dale did not confiscate anything!',
    'I am backing up the memories.', 'Even my cursor is tired.'
  ],
  'west.idle': [
    'Where is my Ali? I brought cookies!', 'I came for tacos and gossip!',
    'Young man, stand up straight!', 'This purse holds emergency cinnamon!',
    'Ali, are you eating enough?', 'I can spot good salsa at fifty paces!',
    'Somebody give that grill boy water!', 'I have opinions. Excellent ones!'
  ],
  'west.rush': [
    'MOVE, DARLINGS! Tacos are happening!', 'Ali, honey, mind that heat!',
    'That queue needs two lines, sugar!', 'Jared! Smile with your eyebrows!',
    'I have seen worse at bingo!', 'Everybody let the runner through!',
    'I said NAPKINS, not panic!', 'Scoot over! I brought common sense!'
  ],
  'west.sale': [
    'See? I told you that boy can cook!', 'Put a little love in the bag!',
    'What a polite young customer!', 'Ali, you made another fan!',
    'I would tip twice for that smile!', 'That taco is a keeper!',
    'Tell your mama I said hello!', 'Beautiful service, sweethearts!'
  ],
  'west.combo': [
    'OOH! Look at my Ali GO!', 'That flip deserves a parade!',
    'I nearly dropped my purse!', 'I taught him everything. Sort of!',
    'Now THAT is a team!', 'Three tacos, zero nonsense!',
    'Give those boys a trophy!', 'Somebody photograph that handoff!'
  ],
  'west.mistake': [
    'Oh honey, remake that with love.', 'The salsa is not a swimming pool!',
    'No shame in doing it properly!', 'I have a napkin. I have forty.',
    'Breathe! Your hands know the recipe.', 'Ali, lower that flame, darling.',
    'A good apology costs nothing.', 'We fix our mistakes in this family!'
  ],
  'west.closing': [
    'Ali, take these cookies home!', 'I am proud of all seven of you!',
    'Nobody leaves without a photo!', 'I will see yall tomorrow, dears!',
    'Save that apron, Ali!', 'My purse survived another rush!',
    'That sunset belongs in a frame!', 'Your little stand is a big deal!'
  ],

  // Contextual barks and manager choices.
  'aaron.call.title': 'Call the Line',
  'aaron.call.fastLane': 'Fast Lane: keep the orders moving!',
  'aaron.call.perfectTacos': 'Perfect Tacos: quality first!',
  'aaron.call.goodNeighbor': 'Good Neighbor: take care of folks!',
  'aaron.call.protectGrill': 'Protect the grill! No rushed tacos!',
  'aaron.call.fastLane.result': 'Matt runs; Jared clears the queue!',
  'aaron.call.perfectTacos.result': 'Ali slows down for a cleaner sear.',
  'aaron.call.goodNeighbor.result': 'The crew makes time for every smile.',
  'aaron.call.protectGrill.result': 'Ali has room to do it right.',
  'west.advice.queue': [
    'Split that line before it splits you!', 'Jared, move pickups to the left!',
    'Put a sign where folks can see it!', 'One line to order, one to collect!'
  ],
  'west.advice.grill': [
    'Ali, lower the flame a tiny bit!', 'Let the pan settle, sweetheart!',
    'Brown the tortilla. Do not bully it!', 'Hot and steady beats hot and sorry!'
  ],
  'west.advice.prep': [
    'Phillip, refill before you run dry!', 'Chop before the crowd shows up!',
    'Keep the cold toppings cold, dears!', 'Lids on! The grackles are watching!'
  ],
  'west.advice.customer': [
    'Remember the regulars, sweethearts!', 'A kind word is free, sugar!',
    'That young one needs a seat!', 'Fix a wrong order before it walks!'
  ],
  'west.advice.ali': [
    'My Ali needs water and a compliment!', 'Ali, honey, taste that salsa!',
    'I saved the good seasoning for Ali!', 'Handsome AND he knows a grill!'
  ],
  'west.arrive': ['Ali! Your fan club has arrived!', 'Out of my way, I see Ali!'],
  'west.exit': ['Purse packed! Love you, children!', 'Ali, those cookies are YOURS!'],
  'west.apron': 'World’s Best Taco Chef. I stitched it myself!',
  'west.return': 'I was gone three days! Did you miss me, Ali?',
  'ali.west.arrive': 'Oh. Hey, Mrs. West. Good to see you.',
  'ali.west.apron': 'Thank you. I am wearing it tomorrow.',

  // All five hacks are fictional campus interactions, never real endpoints.
  'antonio.hack.title': 'ANTONIO.EXE · One hack per rush',
  'antonio.hack.prompt': 'Pick one campus prank, then hold to launch.',
  'antonio.hack.locked': 'Laptop cooling off. Dale is watching.',
  'antonio.hack.used': 'One hack per rush. No double dipping.',
  'antonio.hack.agenda.label': 'Old Main Agenda',
  'antonio.hack.agenda.hint': 'Swap one class slide for taco propaganda.',
  'antonio.hack.agenda.target': 'TODAY: go get tacos',
  'antonio.hack.agenda.success': [
    'Old Main just assigned a taco break!', 'The lecture now has a lunch objective!',
    'A whole class heads for the Quad!'
  ],
  'antonio.hack.agenda.backfire': [
    'Oops. The dean got the slide. So did Dale.',
    'Professor Bell asks for a source citation.'
  ],
  'antonio.hack.bell.label': 'Early Bell',
  'antonio.hack.bell.hint': 'Nudge the fictional class bell schedule.',
  'antonio.hack.bell.target': 'CLASS DISMISSED: taco o’clock',
  'antonio.hack.bell.success': [
    'Students flood the Quad ahead of time!', 'The early bell starts a taco wave!',
    'Matt sees a wave coming from Old Main!'
  ],
  'antonio.hack.bell.backfire': [
    'The bell plays twice. Dale hears both.',
    'The dean schedules a meeting about bells.'
  ],
  'antonio.hack.wifi.label': 'TACO-NET Wi-Fi',
  'antonio.hack.wifi.hint': 'Put a taco page on a pretend campus login.',
  'antonio.hack.wifi.target': 'Connect to TACO-NET',
  'antonio.hack.wifi.success': [
    'TACO-NET just became the hot spot!', 'The login page points toward lunch!',
    'Students follow the taco-shaped signal!'
  ],
  'antonio.hack.wifi.backfire': [
    'The fake login shows on Dale’s tablet.',
    'The Wi-Fi page links to the dean’s meeting.'
  ],
  'antonio.hack.guac.label': 'Free Guac Alert',
  'antonio.hack.guac.hint': 'Send a pretend alert. Risk: disappointed fans.',
  'antonio.hack.guac.target': 'Free guac on the Quad!',
  'antonio.hack.guac.success': [
    'A guac-hungry crowd appears!', 'The Quad erupts in avocado questions!',
    'New customers ask about the fine print!'
  ],
  'antonio.hack.guac.backfire': [
    'No free guac budget. Dale is not amused.',
    'Someone shows Dale the fake guac alert.'
  ],
  'antonio.hack.rivalApp.label': 'Synergy App Mix-Up',
  'antonio.hack.rivalApp.hint': 'Confuse a fictional rival demo order screen.',
  'antonio.hack.rivalApp.target': 'Taco Synergy LLC → SIFE Tacos?',
  'antonio.hack.rivalApp.success': [
    'Synergy’s demo app recommends our tacos!', 'Even their mascot ordered from us!',
    'Victor calls it market collaboration.'
  ],
  'antonio.hack.rivalApp.backfire': [
    'Victor took a screenshot. Dale got copied.',
    'The rival app shows Dale our sticker logo.'
  ],
  'antonio.hack.generic.success': 'Technically, it was excellent outreach.',
  'antonio.hack.generic.backfire': 'Wrong tab. That is the dean’s calendar!',
  'antonio.hack.daleIncoming': 'Dale is coming. Close the laptop.',

  // Inspector Dale is strict for good reasons.
  'dale.arrive': ['I received a concerning campus report.', 'Antonio. We need to talk.', 'Is that laptop involved again?'],
  'dale.inspect': ['Show me the food-service checklist.', 'Hot food stays hot. Nonnegotiable.', 'Where is your approved setup?', 'Handwashing first. Comedy later.'],
  'dale.warning': ['Fix the issue, then resume service.', 'False campus messages are not marketing.', 'No unsafe shortcuts. Not even funny ones.'],
  'dale.resolved': ['Good correction. Keep those standards.', 'You made this right. Carry on.', 'That is the procedure I wanted.'],
  'dale.regular': ['One bean taco. And a receipt.', 'The food is good. Do not quote me.', 'Still watching. Also, extra salsa.'],
  'dale.exit': ['Carry on. Responsibly.', 'I will return. Probably hungry.'],

  // Customers are grouped by role, not individual speech files.
  'customer.student': [
    'I have seven minutes till class!', 'This smells better than my meal plan.',
    'Do yall take study breaks?', 'One taco before Alkek, please!',
    'I survived the stairs for this.', 'Please add the spicy salsa.'
  ],
  'customer.professor': [
    'Lunch is part of my curriculum.', 'Could I cite this queso?',
    'One taco. My lecture ran long.', 'Excellent applied entrepreneurship.',
    'My office hours can wait.', 'No late penalties for salsa, I hope.'
  ],
  'customer.tourParent': [
    'Is this part of the campus tour?', 'My kid would eat here every day.',
    'Does the school teach this?', 'Two tacos, one proud parent.',
    'Do you have napkins for photos?', 'I would enroll for the queso.'
  ],
  'customer.athlete': [
    'Make it two. Practice was brutal.', 'Protein, please. Lots.',
    'Do yall have a team combo?', 'Coach did not mention queso.',
    'I can hold four tacos.', 'I ran here faster than warmups.'
  ],
  'customer.bandKid': [
    'Can you hear me over the tuba?', 'One taco in B-flat, please.',
    'I need a salsa solo.', 'Our brass section wants ten.',
    'Is this a halftime snack?', 'I will pay after the cymbal crash.'
  ],
  'customer.regular': [
    'The usual, please!', 'You remembered my order!',
    'I brought a friend this time.', 'Save me the smoky salsa!'
  ],
  'customer.impatient': ['I might miss class!', 'How much longer?', 'I need to run!'],
  'customer.happy': ['Worth the wait!', 'See you tomorrow!', 'That hit the spot!'],

  // Maya: three playable days and a persistent relationship payoff.
  'maya.day1.arrive': 'Hi. Is one taco okay?',
  'maya.day1.order': 'Just one bean taco, please.',
  'maya.day1.leave': 'Thanks. I might come back tomorrow.',
  'maya.day2.arrive': 'Hey! You remembered me?',
  'maya.day2.order': 'Same taco. And extra salsa this time.',
  'maya.day2.leave': 'I told my roommate about yall.',
  'maya.day3.arrive': 'This is my friend {name}!',
  'maya.day3.order': 'Two bean tacos. We came together.',
  'maya.day3.leave': 'See you both tomorrow!',
  'maya.scrapbook': 'Maya brought a friend to the Quad.',
  'maya.pitch': 'I made some slides for your SIFE pitch.',

  // Outcomes use stable variants rather than encoding gameplay effects.
  'event.tourGroup.intro': 'Two hundred tour parents. One tiny stand.',
  'event.tourGroup.accept': 'Offer a tour-group taco bundle.',
  'event.tourGroup.decline': 'Keep the regular queue moving.',
  'event.tourGroup.outcome.good': 'Parents cheer for student business!',
  'event.tourGroup.outcome.bad': 'Tour photos feature a very long line.',
  'event.fountainFoam.intro': 'The fountain is wearing a foam mustache.',
  'event.fountainFoam.accept': 'Serve the curious foam spectators.',
  'event.fountainFoam.decline': 'Move the pickup line away from the foam.',
  'event.fountainFoam.outcome.good': 'Foam watchers discover good tacos.',
  'event.fountainFoam.outcome.bad': 'Antonio gets blamed for the bubbles.',
  'event.brassSection.intro': 'A tuba has parked next to the register.',
  'event.brassSection.accept': 'Offer the band a break-time bundle.',
  'event.brassSection.decline': 'Ask them to rehearse farther away.',
  'event.brassSection.outcome.good': 'The band plays a taco victory riff!',
  'event.brassSection.outcome.bad': 'Jared heard every order as “tuba.”',
  'event.mascotHead.intro': 'A mystery Bobcat head starts waving.',
  'event.mascotHead.accept': 'Welcome the homemade mascot.',
  'event.mascotHead.decline': 'Politely clear up the mascot confusion.',
  'event.mascotHead.outcome.good': 'The mystery mascot wins new fans!',
  'event.mascotHead.outcome.bad': 'Nobody knows who was in that head.',
  'event.floatieParade.intro': 'River floaties are clogging the Quad!',
  'event.floatieParade.accept': 'Make a quick floatie-crew combo.',
  'event.floatieParade.decline': 'Keep a clear route for Matt.',
  'event.floatieParade.outcome.good': 'River kids form a loyal taco flotilla.',
  'event.floatieParade.outcome.bad': 'An inner tube blocks the pickup sign.',
  'event.tacoReview.intro': 'A creator calls this a “$50 taco review.”',
  'event.tacoReview.accept': 'Serve one showcase taco.',
  'event.tacoReview.decline': 'Give them the regular taco treatment.',
  'event.tacoReview.outcome.good': 'The dramatic review ends in applause.',
  'event.tacoReview.outcome.bad': 'Ali nearly grilled the camera tripod.',
  'event.flashMob.intro': 'A dance rehearsal has escaped outside.',
  'event.flashMob.accept': 'Let Matt dance for one chorus.',
  'event.flashMob.decline': 'Keep Matt on the delivery route.',
  'event.flashMob.outcome.good': 'Matt nails the tray-carrying dance!',
  'event.flashMob.outcome.bad': 'The dancers form a surprise queue.',
  'event.quesoDebate.intro': 'Two students demand a queso referee.',
  'event.quesoDebate.accept': 'Let Phillip offer tiny samples.',
  'event.quesoDebate.decline': 'Stay neutral in the great queso war.',
  'event.quesoDebate.outcome.good': 'The samples end the queso standoff.',
  'event.quesoDebate.outcome.bad': 'The debate moves into the lunch line.',
  'event.pitchPractice.intro': 'A student pitches a solar tortilla fork.',
  'event.pitchPractice.accept': 'Offer thoughtful pitch feedback.',
  'event.pitchPractice.decline': 'Buy one absurd prototype fork.',
  'event.pitchPractice.outcome.good': 'A new entrepreneur joins your corner.',
  'event.pitchPractice.outcome.bad': 'The fork casts a very tiny shadow.',
  'event.tasselIncident.intro': 'A graduation tassel snags a string light!',
  'event.tasselIncident.accept': 'Help untangle it safely.',
  'event.tasselIncident.decline': 'Pause service and call campus staff.',
  'event.tasselIncident.outcome.good': 'A grateful graduate requests a photo.',
  'event.tasselIncident.outcome.bad': 'Mrs. West declares a purse emergency.',

  // Dusk photo, scrapbook and repeatable Closing Time ritual.
  'closing.title': 'Closing Time on the Quad',
  'closing.step.cash': 'Jared counts the drawer.',
  'closing.step.clean': 'Phillip and Ali clean the line.',
  'closing.step.delivery': 'Matt parks the last tray.',
  'closing.step.laptop': 'Antonio closes the laptop. Finally.',
  'closing.step.memory': 'Aaron asks for one highlight.',
  'closing.step.photo': 'Everybody squeeze in. Sunset photo!',
  'closing.prompt.highlight': 'What will we remember from today?',
  'closing.prompt.tomorrow': 'Tomorrow on the Quad:',
  'closing.result.profit': 'Today earned {amount} for the dream.',
  'closing.result.goodwill': '{count} neighbors left smiling.',
  'closing.result.combo': 'Best streak: {count} clean handoffs.',
  'closing.photo.caption': [
    'Seven friends. One sunset. Too many tacos.',
    'The Quad smelled like a good idea.',
    'A little business with a big heart.',
    'San Marcos gave us another golden hour.',
    'Nobody posed normally. Perfect.',
    'The grackles demanded photo credit.',
    'From a folding table to something real.',
    'Sunset, salsa, and the whole crew.'
  ],
  'closing.photo.west': 'Mrs. West made Ali stand in the middle.',
  'closing.photo.maya': 'Maya waved from the edge of the frame.',
  'closing.photo.dale': 'Dale stood outside the frame. Mostly.',
  'closing.photo.outpost': 'Branch #2 made it into the sunset shot.',
  'closing.final': 'One last taco. One unforgettable semester.',

  // Cooler Kid applicants: names/quirks do not determine gameplay stats.
  'hire.benny.name': 'Benny “Five More Minutes”',
  'hire.benny.quirk': 'Sits on the cooler. Customers find it funny.',
  'hire.benny.intro': 'I can hold a cooler. Is that a skill?',
  'hire.benny.growth': 'Becomes a calm, trusted outpost manager.',
  'hire.benny.ability': 'Easygoing: calms impatient customers.',
  'hire.priya.name': 'Priya “Spreadsheet”',
  'hire.priya.quirk': 'Counts every tortilla, twice.',
  'hire.priya.intro': 'I already made an inventory sheet.',
  'hire.priya.growth': 'Masters the restock schedule.',
  'hire.priya.ability': 'Stock Sense: reduces wasted refill trips.',
  'hire.chuy.name': 'Chuy “Quality Control”',
  'hire.chuy.quirk': 'Samples tacos and writes fake reviews.',
  'hire.chuy.intro': 'I can taste-test on company time?',
  'hire.chuy.growth': 'Predicts the specials people will love.',
  'hire.chuy.ability': 'Taste Test: spots a winning daily special.',
  'hire.jules.name': 'Jules “Networking”',
  'hire.jules.quirk': 'Can turn one sale into a ten-minute chat.',
  'hire.jules.intro': 'I already know half the Quad.',
  'hire.jules.growth': 'Builds a loyal group-order network.',
  'hire.jules.ability': 'Referral Charm: attracts return customers.',
  'outpost.unlock': 'One freshman. Eight tacos. Branch #2.',
  'outpost.restock': 'Back to the main stand for more tacos!',
  'outpost.firstSale': 'Wait. Did we just earn money over there?',
  'outpost.promotion': 'Your very own maroon visor. Congrats!',
  'outpost.unionsign': 'WE DEMAND SHADE AND TACOS.',
  'outpost.rebrand': 'Welcome to Benny’s Taco Conglomerate.',
  'outpost.full': 'SIFE Tacos: Branch #2 is open!',

  // XP perks: selectable between days; rules engine owns effects/caps.
  'perk.jared.upsell.name': 'Friendly Upsell',
  'perk.jared.upsell.desc': 'Jared offers a side; tickets grow a little.',
  'perk.jared.regulars.name': 'Regulars’ Favorite',
  'perk.jared.regulars.desc': 'Jared greets names; regulars wait longer.',
  'perk.phillip.mise.name': 'Mise en Place',
  'perk.phillip.mise.desc': 'Phillip pre-stacks toppings before a wave.',
  'perk.phillip.artist.name': 'Topping Artist',
  'perk.phillip.artist.desc': 'Fancy finishing moves lift taco smiles.',
  'perk.ali.doubleFlip.name': 'Double Flip',
  'perk.ali.doubleFlip.desc': 'Ali flips two tacos in one clean motion.',
  'perk.ali.showman.name': 'Grill Showman',
  'perk.ali.showman.desc': 'Spatula twirls draw curious students.',
  'perk.matt.sprint.name': 'Quad Sprint',
  'perk.matt.sprint.desc': 'Matt dashes to pickups, a little faster.',
  'perk.matt.balance.name': 'Tray Balance',
  'perk.matt.balance.desc': 'Matt carries three orders without a spill.',
  'perk.aaron.extraCall.name': 'Second Opinion',
  'perk.aaron.extraCall.desc': 'Unlock a new Call the Line tactic.',
  'perk.aaron.forecast.name': 'Crowd Reader',
  'perk.aaron.forecast.desc': 'Aaron spots incoming waves earlier.',
  'perk.antonio.cooldown.name': 'Cleaner Code',
  'perk.antonio.cooldown.desc': 'Antonio recovers from a bad hack sooner.',
  'perk.antonio.newTarget.name': 'New Target',
  'perk.antonio.newTarget.desc': 'Unlock one more fictional campus prank.',
  'perk.west.queueCoach.name': 'Queue Whisperer',
  'perk.west.queueCoach.desc': 'Mrs. West points out the pickup lane.',
  'perk.west.aliBoost.name': 'Ali’s Fan Club',
  'perk.west.aliBoost.desc': 'Her visit steadies Ali after mistakes.',
  'perk.friendship.prepGrill.name': 'Tortilla Toss',
  'perk.friendship.prepGrill.desc': 'Phillip tosses; Ali catches on cue.',
  'perk.friendship.registerRunner.name': 'Golden Handoff',
  'perk.friendship.registerRunner.desc': 'Jared and Matt nail the pickup relay.',
  'perk.friendship.westAli.name': 'Secret Seasoning',
  'perk.friendship.westAli.desc': 'Mrs. West shares her gentle grill tip.',
  'perk.title': 'Crew Level Up',
  'perk.choose': 'Choose one perk for {name}.',
  'perk.confirm': 'New skill, new little moment!',

  // Semester story framing; optional for scripted interludes.
  'story.week1': 'Six friends, one terrible idea.',
  'story.week2': 'Word travels faster than Matt.',
  'story.week3': 'Taco Synergy LLC enters the Quad.',
  'story.week4': 'Inspector Dale has questions.',
  'story.week5': 'A freshman arrives with a cooler.',
  'story.week6': 'Branch #2 learns the hard way.',
  'story.week7': 'Maroon game day. Double the crowds.',
  'story.week8': 'The great taco shortage begins.',
  'story.week9': 'SIFE showcase. Judges are coming.',
  'story.week10': 'Victor wants to buy Branch #2.',
  'story.week11': 'Finals week. Alkek stays busy.',
  'story.week12': 'The last bell. The biggest rush.',
  'story.rival.offer': 'We seek your satellite food vertical.',
  'story.dale.trust': 'Standards matter. You have earned my trust.',
  'story.finale.dream': 'Nationals, here we come!',
  'story.finale.people': 'The Quad showed up for us.',
  'story.finale.disaster': 'Not first place. Still our people.',
  'story.finale.photo': 'Seven friends started something lasting.',
  // Current character canon wins over the historical draft above; keep IDs stable.
  ...characterLines,
  ...semesterLines
};

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/** Deterministic generator; pass its result as the third argument to t(). */
export function createSeededRng(seed = 1) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return function seededRandom() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export const strings = deepFreeze(DATA);

/**
 * t('matt.rush', {name: 'Maya'}, seededRng) -> plain string.
 * Missing keys are returned unchanged. A variant RNG returns [0,1).
 */
export function t(key, vars = {}, rng = Math.random) {
  if (!Object.prototype.hasOwnProperty.call(strings, key)) return String(key);
  const entry = strings[key];
  const random = typeof rng === 'function' ? rng : Math.random;
  const value = Array.isArray(entry)
    ? entry[Math.min(entry.length - 1, Math.max(0, Math.floor((Number(random()) || 0) * entry.length)))]
    : entry;
  return value.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars ?? {}, name) && vars[name] != null
      ? String(vars[name])
      : match
  );
}

export default strings;
